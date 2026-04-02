import { verifyDatabase } from "../verify.js";

const result = verifyDatabase();

console.log("[db:verify] dbPath:", result.dbPath);
console.log("[db:verify] role_packs rows:", result.rolePackCount);
console.log("[db:verify] employees rows:", result.employeeCount);
console.log("[db:verify] account_pools rows:", result.accountPoolCount);
console.log("[db:verify] runtime_profiles rows:", result.runtimeProfileCount);
console.log("[db:verify] routing_rules rows:", result.routingRuleCount);
console.log("[db:verify] status: ok");
