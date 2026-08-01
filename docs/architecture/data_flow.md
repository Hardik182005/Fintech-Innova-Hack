# Module update: 1785587568-7
# Data Flow Overview

`
[Client App] --> (API Gateway) --> [Credence Service] --> [Ledger / Vault DB]
                                           |
                                  (Policy Engine)
`

1. Client submits request payload.
2. Passport service authenticates bearer token.
3. Policy engine checks authorization rules.
4. Ledger commits immutable transaction record.
