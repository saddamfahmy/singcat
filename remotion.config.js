const { Config } = require("@remotion/cli/config");

Config.setPublicDir("publick");
Config.setEntryPoint("src/remotion/index.jsx");
Config.setDelayRenderTimeoutInMilliseconds(120000);
