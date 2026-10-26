// DynamoDB implementation of Store (spec §5). Exercised by the post-deploy smoke test (API-13).
import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { CachedTitle, Device, Household, HomeDevice, InviteRec, OtpRec, PairCodeRec, Pick, Rec, SentRec, Store, TokenRec, User } from "./store.js";
import { epochSeconds } from "./time.js";

const isConditionFail = (e: unknown) =>
  e instanceof ConditionalCheckFailedException || (e as { name?: string })?.name === "ConditionalCheckFailedException";

function strip<T>(item: Record<string, unknown> | undefined): T | undefined {
  if (!item) return undefined;
  const { PK: _pk, SK: _sk, ttl: _ttl, ...rest } = item;
  return rest as T;
}

export class DynamoStore implements Store {
  private doc: DynamoDBDocumentClient;
  constructor(private table: string, client = new DynamoDBClient({})) {
    this.doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  }

  async getTitle(key: string) {
    return this.get<CachedTitle>(`TITLE#${key}`, "META");
  }
  async putTitle(t: CachedTitle, expiresAt: Date) {
    await this.put({ PK: `TITLE#${t.key}`, SK: "META", ...t, ttl: epochSeconds(expiresAt) });
  }

  private async get<T>(PK: string, SK: string): Promise<T | undefined> {
    const r = await this.doc.send(new GetCommand({ TableName: this.table, Key: { PK, SK } }));
    return strip<T>(r.Item);
  }
  private async put(item: Record<string, unknown>, condition?: string, values?: Record<string, unknown>): Promise<boolean> {
    try {
      await this.doc.send(new PutCommand({ TableName: this.table, Item: item, ConditionExpression: condition, ExpressionAttributeValues: values }));
      return true;
    } catch (e) {
      if (condition && isConditionFail(e)) return false;
      throw e;
    }
  }

  putPairCode(c: PairCodeRec) {
    return this.put(
      { PK: `CODE#${c.code}`, SK: "META", ...c, ttl: epochSeconds(new Date(c.expiresAt)) },
      "attribute_not_exists(PK)",
    );
  }
  getPairCode(code: string) {
    return this.get<PairCodeRec>(`CODE#${code}`, "META");
  }
  async approvePairCode(code: string, householdId: string, userId: string) {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { PK: `CODE#${code}`, SK: "META" },
          UpdateExpression: "SET #s = :a, householdId = :h, approvedBy = :u",
          ConditionExpression: "#s = :p",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":a": "approved", ":p": "pending", ":h": householdId, ":u": userId },
        }),
      );
      return true;
    } catch (e) {
      if (isConditionFail(e)) return false;
      throw e;
    }
  }
  async deletePairCode(code: string) {
    try {
      await this.doc.send(
        new DeleteCommand({
          TableName: this.table,
          Key: { PK: `CODE#${code}`, SK: "META" },
          ConditionExpression: "attribute_exists(PK)",
        }),
      );
      return true;
    } catch (e) {
      if (isConditionFail(e)) return false;
      throw e;
    }
  }

  getDevice(id: string) {
    return this.get<Device>(`DEVICE#${id}`, "META");
  }
  async putDevice(d: Device) {
    await this.put({ PK: `DEVICE#${d.id}`, SK: "META", ...d });
  }
  getToken(hash: string) {
    return this.get<TokenRec>(`TOKEN#${hash}`, "META");
  }
  async putToken(t: TokenRec) {
    await this.put({ PK: `TOKEN#${t.hash}`, SK: "META", ...t });
  }
  async deleteToken(hash: string) {
    await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { PK: `TOKEN#${hash}`, SK: "META" } }));
  }

  getHousehold(id: string) {
    return this.get<Household>(`HH#${id}`, "META");
  }
  getUser(id: string) {
    return this.get<User>(`USER#${id}`, "PROFILE");
  }
  async listFriendIds(userId: string) {
    const r = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :f)",
        ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":f": "FRIEND#" },
      }),
    );
    return (r.Items ?? []).map((i) => String(i.SK).slice("FRIEND#".length));
  }

  async putRec(r: Rec) {
    await this.put({ PK: `HH#${r.householdId}`, SK: `REC#${r.recId}`, ...r });
  }
  getRec(householdId: string, recId: string) {
    return this.get<Rec>(`HH#${householdId}`, `REC#${recId}`);
  }
  async listRecs(householdId: string, opts: { sinceRecId?: string; limit?: number } = {}) {
    const out: Rec[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const r = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: opts.sinceRecId
            ? "PK = :pk AND SK BETWEEN :lo AND :hi"
            : "PK = :pk AND begins_with(SK, :rec)",
          ExpressionAttributeValues: opts.sinceRecId
            ? { ":pk": `HH#${householdId}`, ":lo": `REC#${opts.sinceRecId}`, ":hi": "REC#\uffff" }
            : { ":pk": `HH#${householdId}`, ":rec": "REC#" },
          ScanIndexForward: false,
          Limit: opts.limit ? opts.limit - out.length : undefined,
          ExclusiveStartKey: start,
        }),
      );
      out.push(...(r.Items ?? []).map((i) => strip<Rec>(i)!));
      start = r.LastEvaluatedKey;
    } while (start && (!opts.limit || out.length < opts.limit));
    return out;
  }
  async markSeen(householdId: string, recId: string, at: string) {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { PK: `HH#${householdId}`, SK: `REC#${recId}` },
          UpdateExpression: "SET seen = :t, seenAt = :at",
          ConditionExpression: "attribute_exists(PK)",
          ExpressionAttributeValues: { ":t": true, ":at": at },
        }),
      );
    } catch (e) {
      if (!isConditionFail(e)) throw e;
    }
  }

  async markUnseen(householdId: string, recId: string) {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { PK: `HH#${householdId}`, SK: `REC#${recId}` },
          UpdateExpression: "SET seen = :f REMOVE seenAt",
          ConditionExpression: "attribute_exists(PK)",
          ExpressionAttributeValues: { ":f": false },
        }),
      );
    } catch (e) {
      if (!isConditionFail(e)) throw e;
    }
  }

  async putHousehold(h: Household) {
    await this.put({ PK: `HH#${h.id}`, SK: "META", ...h });
  }
  async putUser(u: User) {
    await this.put({ PK: `USER#${u.id}`, SK: "PROFILE", ...u });
    await this.put({ PK: `HH#${u.householdId}`, SK: `MEMBER#${u.id}`, displayName: u.displayName });
  }
  private async queryAll(pk: string, prefix: string, opts: { limit?: number; desc?: boolean } = {}) {
    const out: Record<string, unknown>[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const r = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
          ExpressionAttributeValues: { ":pk": pk, ":p": prefix },
          ScanIndexForward: !opts.desc,
          Limit: opts.limit ? opts.limit - out.length : undefined,
          ExclusiveStartKey: start,
        }),
      );
      out.push(...(r.Items ?? []));
      start = r.LastEvaluatedKey;
    } while (start && (!opts.limit || out.length < opts.limit));
    return out;
  }
  async getEmailOwner(h: string) {
    return (await this.get<{ userId: string }>(`EMAIL#${h}`, "META"))?.userId;
  }
  claimEmail(h: string, userId: string) {
    return this.put({ PK: `EMAIL#${h}`, SK: "META", userId }, "attribute_not_exists(PK) OR userId = :u", { ":u": userId });
  }
  async releaseEmail(h: string, userId: string) {
    try {
      await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { PK: `EMAIL#${h}`, SK: "META" }, ConditionExpression: "userId = :u", ExpressionAttributeValues: { ":u": userId } }));
    } catch (e) {
      if (!isConditionFail(e)) throw e;
    }
  }
  async getReviewCode(h: string) {
    return (await this.get<{ codeHash: string }>(`REVIEW#${h}`, "META"))?.codeHash;
  }
  async putReviewCode(h: string, codeHash: string) {
    await this.put({ PK: `REVIEW#${h}`, SK: "META", codeHash });
  }
  getOtp(h: string, p: OtpRec["purpose"]) {
    return this.get<OtpRec>(`OTP#${h}`, p);
  }
  async putOtp(o: OtpRec) {
    // TTL a day after the send window so the per-address send counter survives the code.
    await this.put({ PK: `OTP#${o.emailHash}`, SK: o.purpose, ...o, ttl: epochSeconds(new Date(Date.parse(o.windowStart) + 86400e3)) });
  }
  async consumeOtp(h: string, p: OtpRec["purpose"], codeHash: string) {
    try {
      await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { PK: `OTP#${h}`, SK: p }, ConditionExpression: "codeHash = :c", ExpressionAttributeValues: { ":c": codeHash } }));
      return true;
    } catch (e) {
      if (isConditionFail(e)) return false;
      throw e;
    }
  }
  async bumpOtpAttempts(h: string, p: OtpRec["purpose"]) {
    try {
      await this.doc.send(new UpdateCommand({ TableName: this.table, Key: { PK: `OTP#${h}`, SK: p }, UpdateExpression: "ADD attempts :one", ConditionExpression: "attribute_exists(PK)", ExpressionAttributeValues: { ":one": 1 } }));
    } catch (e) {
      if (!isConditionFail(e)) throw e;
    }
  }
  async listMemberIds(householdId: string) {
    return (await this.queryAll(`HH#${householdId}`, "MEMBER#")).map((i) => String(i.SK).slice("MEMBER#".length));
  }
  async putHomeDevice(d: HomeDevice) {
    await this.put({ PK: `HH#${d.householdId}`, SK: `DEVICE#${d.deviceId}`, ...d });
  }
  async listHomeDevices(householdId: string) {
    return (await this.queryAll(`HH#${householdId}`, "DEVICE#")).map((i) => strip<HomeDevice>(i)!);
  }
  async deleteHomeDevice(householdId: string, deviceId: string) {
    await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { PK: `HH#${householdId}`, SK: `DEVICE#${deviceId}` } }));
  }
  async putSent(x: SentRec) {
    await this.put({ PK: `USER#${x.userId}`, SK: `SENT#${x.recId}`, ...x });
  }
  async listSent(userId: string, limit: number) {
    return (await this.queryAll(`USER#${userId}`, "SENT#", { limit, desc: true })).map((i) => strip<SentRec>(i)!);
  }
  async clearSent(userId: string) {
    const items = await this.queryAll(`USER#${userId}`, "SENT#");
    for (const i of items) await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { PK: i.PK, SK: i.SK } }));
    return items.length;
  }
  async putInvite(i: InviteRec) {
    const ttl = epochSeconds(new Date(i.expiresAt));
    await this.put({ PK: `INVITE#${i.codeHash}`, SK: "META", ...i, ttl });
    await this.put({ PK: `USER#${i.inviterId}`, SK: `INVITE#${i.id}`, ...i, ttl });
  }
  getInvite(h: string) {
    return this.get<InviteRec>(`INVITE#${h}`, "META");
  }
  async listInvites(userId: string) {
    return (await this.queryAll(`USER#${userId}`, "INVITE#", { desc: true })).map((i) => strip<InviteRec>(i)!);
  }
  getInviteById(userId: string, id: string) {
    return this.get<InviteRec>(`USER#${userId}`, `INVITE#${id}`);
  }
  async consumeInvite(i: InviteRec) {
    await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { PK: `USER#${i.inviterId}`, SK: `INVITE#${i.id}` } }));
    try {
      await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { PK: `INVITE#${i.codeHash}`, SK: "META" }, ConditionExpression: "attribute_exists(PK)" }));
      return true;
    } catch (e) {
      if (isConditionFail(e)) return false;
      throw e;
    }
  }
  async bumpInviteEmails(userId: string, day: string, max: number) {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { PK: `USER#${userId}`, SK: `INVRATE#${day}` },
          UpdateExpression: "ADD n :one SET #t = if_not_exists(#t, :ttl)",
          ConditionExpression: "attribute_not_exists(n) OR n < :max",
          ExpressionAttributeNames: { "#t": "ttl" },
          ExpressionAttributeValues: { ":one": 1, ":max": max, ":ttl": epochSeconds(new Date(Date.now() + 2 * 86400e3)) },
        }),
      );
      return true;
    } catch (e) {
      if (isConditionFail(e)) return false;
      throw e;
    }
  }
  async deleteFriendship(a: string, b: string) {
    // Both directions in one transaction so a crash can't leave a one-way friendship.
    await this.doc.send(
      new TransactWriteCommand({
        TransactItems: [
          { Delete: { TableName: this.table, Key: { PK: `USER#${a}`, SK: `FRIEND#${b}` } } },
          { Delete: { TableName: this.table, Key: { PK: `USER#${b}`, SK: `FRIEND#${a}` } } },
        ],
      }),
    );
  }
  async putFriendship(a: string, b: string) {
    await this.doc.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: this.table, Item: { PK: `USER#${a}`, SK: `FRIEND#${b}` } } },
          { Put: { TableName: this.table, Item: { PK: `USER#${b}`, SK: `FRIEND#${a}` } } },
        ],
      }),
    );
  }
  async clearHouseholdActivity(householdId: string) {
    const keys: { PK: string; SK: string }[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const r = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": `HH#${householdId}` },
          ProjectionExpression: "PK, SK",
          ExclusiveStartKey: start,
        }),
      );
      for (const i of r.Items ?? []) if (/^(REC|PICK|PICKTRY)#/.test(String(i.SK))) keys.push({ PK: String(i.PK), SK: String(i.SK) });
      start = r.LastEvaluatedKey;
    } while (start);
    for (let i = 0; i < keys.length; i += 25) {
      let req: Record<string, unknown>[] | undefined = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
      for (let attempt = 0; req?.length && attempt < 5; attempt++) {
        const r = await this.doc.send(new BatchWriteCommand({ RequestItems: { [this.table]: req as never } }));
        req = r.UnprocessedItems?.[this.table] as Record<string, unknown>[] | undefined;
        if (req?.length) await new Promise((res) => setTimeout(res, 100 * 2 ** attempt));
      }
      if (req?.length) throw new Error("clearHouseholdActivity: unprocessed deletes");
    }
    return keys.length;
  }

  getPick(householdId: string, date: string) {
    return this.get<Pick>(`HH#${householdId}`, `PICK#${date}`);
  }
  async putPick(p: Pick) {
    const ttl = epochSeconds(new Date(new Date(p.createdAt).getTime() + 36 * 60 * 60 * 1000));
    await this.put({ PK: `HH#${p.householdId}`, SK: `PICK#${p.date}`, ...p, ttl });
  }
  async claimPickAttempt(householdId: string, date: string, expiresAt: Date) {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.table,
          Item: { PK: `HH#${householdId}`, SK: `PICKTRY#${date}`, ttl: epochSeconds(expiresAt) },
          // TTL deletion is lazy, so an expired marker still counts as free.
          ConditionExpression: "attribute_not_exists(PK) OR #t < :now",
          ExpressionAttributeNames: { "#t": "ttl" },
          ExpressionAttributeValues: { ":now": epochSeconds(new Date()) },
        }),
      );
      return true;
    } catch (e) {
      if (isConditionFail(e)) return false;
      throw e;
    }
  }
}
