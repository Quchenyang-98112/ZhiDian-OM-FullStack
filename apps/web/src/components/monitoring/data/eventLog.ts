/** Demo event-log entries for the monitoring event stream panel. */
export function buildEventLog(t: (key: string) => string) {
  return [
    {
      time: '14:32:08',
      level: 'info' as const,
      source: 'victron-mqtt',
      msg: t('monitoring.evtMqttReconnect'),
    },
    {
      time: '14:15:22',
      level: 'warn' as const,
      source: 'prometheus',
      msg: t('monitoring.evtScrapeTimeout'),
    },
    { time: '13:48:03', level: 'info' as const, source: 'ocpp', msg: t('monitoring.evtEvSession') },
    {
      time: '13:12:45',
      level: 'info' as const,
      source: 'eebus',
      msg: t('monitoring.evtEebusHandshake'),
    },
    {
      time: '12:55:11',
      level: 'error' as const,
      source: 'knx',
      msg: t('monitoring.evtKnxTimeout'),
    },
    { time: '12:30:00', level: 'info' as const, source: 'system', msg: t('monitoring.evtStartup') },
  ];
}
