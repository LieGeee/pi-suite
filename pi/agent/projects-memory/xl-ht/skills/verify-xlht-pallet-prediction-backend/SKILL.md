---
name: verify-xlht-pallet-prediction-backend
description: Use after changing xl-ht pallet capacity fitting, model persistence/training, prediction persistence, runtime model validation, or transaction flows.
version: 1
created: 2026-07-16
updated: 2026-07-16
---
## When to Use
Use after changes to pallet capacity fitting/prediction, model Mapper or training transactions, prediction service/Writer/Mapper, idempotency hashing, manual adjustment, confirmation, or PageHelper history listing.

## Procedure
1. Work from the repository `hh` directory. Do not connect to the live database, start services, or run migration DML for this verification.
2. For Task 7 changes, run:
   `mvn -pl hh-modules/hh-stock -am -Dtest=PalletPredictionServiceImplTest,PalletPredictionTransactionFlowTest -Dsurefire.failIfNoSpecifiedTests=false test`
3. Run the Task 2-7 regression:
   `mvn -pl hh-modules/hh-stock -am -Dtest=CeilIntervalCoefficientFitterTest,PalletCapacityPredictorTest,PalletCapacityModelMapperFlowTest,PalletCapacityTrainingServiceImplTest,PalletCapacityTrainingTransactionFlowTest,PalletPredictionServiceImplTest,PalletPredictionTransactionFlowTest -Dsurefire.failIfNoSpecifiedTests=false test`
4. Build the module and dependencies:
   `mvn -pl hh-modules/hh-stock -am -DskipTests package`
5. Run `git diff --check`. Inspect the JAR with `unzip -l hh-modules/hh-stock/target/hh-stock.jar` and confirm prediction classes plus `mapper/stock/PalletPredictionMapper.xml` are present.
6. If guarding against build-time source writes, save `sha256sum` for the exact changed source/resource/test files before tests/package and verify with `sha256sum -c` afterward.
7. Read the seven Surefire report summaries directly and add their test counts; do not infer the total from stale reports.

## Pitfalls
- H2 must run in MySQL mode with real MyBatis XML and a real Spring transaction proxy; mock-only tests do not prove rollback or locking.
- PageHelper metadata is lost if a Mapper `Page` is converted to a plain `ArrayList`; preserve pageNum, pageSize, and total.
- Request hashing must use typed UTF-8 length-prefixed fields, code-point ordering, canonical lowercase UUID text, and well-formed Unicode.
- Runtime ACTIVE models require exact metadata plus reduced fractions and `lower < coefficient <= upper`; never use the display decimal for validity or prediction.
- In Git Bash, literal SQL backticks inside double-quoted commands trigger command substitution. Use single quotes or fixed-string searches.
- `rg -h` prints help in this environment; read report files with an explicit pattern instead.

## Verification
Completion evidence requires: focused Task 7 tests at zero failures; all seven Task 2-7 classes at zero failures; package exit 0; source hashes unchanged; JAR entries present; `git diff --check` empty; and no live DB/service/deployment action.