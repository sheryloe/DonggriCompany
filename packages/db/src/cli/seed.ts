import { runSeed } from "../seed.js";

const result = runSeed();

console.log("[db:seed] dbPath:", result.dbPath);
console.log("[db:seed] role_packs rows:", result.insertedRolePacks);
console.log("[db:seed] employees rows:", result.insertedEmployees);
console.log("[db:seed] account_pools rows:", result.insertedAccountPools);
console.log("[db:seed] runtime_profiles rows:", result.insertedRuntimeProfiles);
console.log("[db:seed] routing_rules rows:", result.insertedRoutingRules);
