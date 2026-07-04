// CommonJS so Jest can load it without ts-node. next/jest wires up SWC
// transforms, CSS/image mocks, and env loading so tests run against the same
// toolchain as the app.
const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Match the "@/…" path alias from tsconfig.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  collectCoverageFrom: ["lib/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "!**/*.d.ts"],
};

module.exports = createJestConfig(config);
