// Reads one SSM SecureString (e.g. the TMDB read token) once per cold start. Never logs the value.
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

export function ssmFetcher(name: string, client = new SSMClient({})): () => Promise<string> {
  let p: Promise<string> | undefined;
  return () => {
    p ??= client.send(new GetParameterCommand({ Name: name, WithDecryption: true })).then((r) => {
      const v = (r.Parameter?.Value ?? "").trim();
      if (!v) throw new Error("SSM parameter is empty");
      return v;
    });
    p.catch(() => (p = undefined));
    return p;
  };
}
