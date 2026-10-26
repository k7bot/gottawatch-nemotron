# ADR-0008: Serverless AWS backend

- **Status:** Accepted (plan v2 §5 Architecture, §8 judge-access risk)

## Context
Backend must stay live and free for judges through Fri Nov 20, 12:00pm PT, on Devpost AWS credits, built by one person; AWS use also qualifies for the AWS Builder mini challenge.

## Decision
API Gateway HTTP API + Lambda authorizer; Lambda (Node.js/TypeScript) handlers; DynamoDB single table (TTL for pair codes + pick cache); Bedrock for Tonight's pick; S3 + CloudFront for the PWA and demo art; SSM Parameter Store for the TMDB key; CloudWatch logs; AWS Budgets alarms at 25% / 50% of credit balance; AWS CDK (TypeScript) for IaC; region us-east-1.

## Alternatives
- Firebase/Supabase or a single server: possible but loses the AWS Builder angle and idle-cost profile.

## Consequences
- No idle servers; teardown/redeploy via CDK; keep stack up until after Nov 20.
- Don't add services just to look bigger (plan §5 caveat).
