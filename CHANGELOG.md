# Changelog

## 0.0.11

- Implement ID and document-query capabilities for core 0.3.69 while preserving
  the existing driver registration interface.
- Keep native MongoDB/BSON handling in the driver and normalize foreign BSON IDs.
- Return direct documents or null from atomic document-adapter claims.
- Add integration coverage for DataBuilder, Datatable, queues and notifications.
- Preserve the existing core 0.3.68 driver interface for staged upgrades.

## 0.0.10

- Upgrade the MongoDB Node.js driver from 4.x to ^6.21.0.
- Use typed MongoClient and ObjectId imports; minimum Node.js version is 16.20.1.
- Preserve insert/update results and model ID handling; include regression tests.

Applications using the standard queue worker must also upgrade webframez-core to
0.3.68 or later. That release handles empty findOneAndUpdate results from MongoDB 6.
Direct consumers of connection.client must handle the document/null return value
of findOneAndUpdate, findOneAndReplace and findOneAndDelete (instead of the old
ModifyResult wrapper). No database data migration is required.
