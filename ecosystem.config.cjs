/**
 * PM2 na VPS: pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: "zona-bot",
      script: "bot/index.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
