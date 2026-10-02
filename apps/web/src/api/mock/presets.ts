// The booth preset (mandate M0, docs/01 Example mandates) is owned by the UI compiler so the Seal screen and the mock
// can never disagree; a test pins its rules to the SIMULATED credential fixture [F20].
export { M0_SENTENCE, m0Request as m0SealRequest } from "../../booth/compile";
