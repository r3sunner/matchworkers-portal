import createCronTasks from './cron-tasks';

export default ({ env }) => {
  const cronTasks = createCronTasks({ env });

  console.log(
    '[cron] Registered jobs:',
    Object.keys(cronTasks).length
      ? Object.keys(cronTasks).join(', ')
      : 'none'
  );

  return {
    host: env('HOST', '0.0.0.0'),
    port: env.int('PORT', 1337),

    app: {
      keys: env.array('APP_KEYS'),
    },

    cron: {
      enabled: true,
      tasks: cronTasks,
    },
  };
};