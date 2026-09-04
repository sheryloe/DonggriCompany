import { runContinuityMockDemo } from "../server/modules/workflow/continuity/mock-demo.js";

const result = await runContinuityMockDemo();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
