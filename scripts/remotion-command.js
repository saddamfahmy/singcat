const { spawnSync } = require("node:child_process");
const path = require("node:path");

const [mode, ...argumentsList] = process.argv.slice(2);
if (!["studio", "render"].includes(mode)) {
  throw new Error("Gunakan: node scripts/remotion-command.js <studio|render> [--json=path]");
}

const jsonArgument = argumentsList.find((value) => value.startsWith("--json="));
const hasPortArgument = argumentsList.some((value) => value === "--port" || value.startsWith("--port="));
const remotionExtraArguments = [
  ...argumentsList.filter((value) => !value.startsWith("--json=")),
  ...(mode === "studio" && !hasPortArgument ? ["--port", "3001"] : [])
];
const prepareArguments = jsonArgument ? [jsonArgument] : [];
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};

const hasFluidSynth = spawnSync(
  process.platform === "win32" ? "where.exe" : "which",
  ["fluidsynth"],
  { stdio: "ignore" }
).status === 0;
if (hasFluidSynth) process.env.SINGCAT_NATIVE_SOUNDFONT = "1";

run(process.execPath, [
  path.join(__dirname, "prepare-remotion-data.js"),
  ...prepareArguments
]);
run(process.execPath, [path.join(__dirname, "generate-remotion-audio.js")]);
if (hasFluidSynth) {
  run(process.execPath, [path.join(__dirname, "generate-remotion-soundfont-audio.js")]);
}

const remotionCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const remotionArguments = [
  "remotion",
  mode,
  "src/remotion/index.jsx",
  ...(mode === "render" ? ["SingcatVideo", "out/singcat.mp4"] : []),
  ...remotionExtraArguments,
  "--public-dir",
  "publick"
];
const remotionResult = spawnSync(remotionCommand, remotionArguments, {
  stdio: "inherit",
  shell: process.platform === "win32"
});
if (remotionResult.error) throw remotionResult.error;
if (remotionResult.status !== 0) process.exit(remotionResult.status || 1);
