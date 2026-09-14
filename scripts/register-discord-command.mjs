const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
const guildId = process.env.DISCORD_TEST_GUILD_ID?.trim();
if (!applicationId || !botToken) {
  if (process.argv.includes('--if-configured')) {
    console.log('Discord command registration skipped: credentials are not configured.');
    process.exit(0);
  }
  throw new Error(
    'Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN before registering commands.',
  );
}

const endpoint = guildId
  ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${applicationId}/commands`;
const response = await fetch(endpoint, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${botToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify([
    {
      name: 'mimo',
      type: 1,
      description: 'Build community events and check verified season points.',
      integration_types: [0],
      contexts: [0],
      options: [
        {
          type: 1,
          name: 'create',
          description: 'Ask Mimo to build an editable event for this community.',
          options: [
            {
              type: 3,
              name: 'topic',
              description: 'What should the room be about?',
              required: true,
              max_length: 300,
            },
            {
              type: 3,
              name: 'format',
              description: 'Choose the live experience.',
              required: false,
              choices: [
                { name: 'Game night', value: 'game_night' },
                { name: 'Live vote', value: 'community_vote' },
                { name: 'Product launch', value: 'product_launch' },
                { name: 'Community onboarding', value: 'onboarding' },
                { name: 'Open format', value: 'custom' },
              ],
            },
          ],
        },
        {
          type: 1,
          name: 'points',
          description: 'Show your verified points for this community season.',
        },
      ],
    },
  ]),
});
const result = await response.json().catch(() => ({}));
if (!response.ok) {
  throw new Error(
    `Discord command registration failed (${response.status}): ${JSON.stringify(result)}`,
  );
}
const command = Array.isArray(result)
  ? result.find((item) => item.name === 'mimo')
  : null;
console.log(
  `${guildId ? 'Test-server' : 'Global'} /mimo command registered (${command?.id ?? 'ready'}).`,
);
