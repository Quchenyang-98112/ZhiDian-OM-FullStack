import type { TFunction } from 'i18next';
import { Gauge, Radio, Server, Shield, Wifi, Zap } from 'lucide-react';

/** Static core-adapter definitions rendered in the adapter-health panel. */
export function buildCoreAdapters(t: TFunction) {
  return [
    {
      name: t('monitoring.adapterVictronName'),
      protocol: 'MQTT/WS',
      id: 'victron-mqtt',
      icon: <Radio size={14} aria-hidden="true" />,
      desc: t('monitoring.adapterVictronDesc'),
    },
    {
      name: t('monitoring.adapterModbusName'),
      protocol: 'Modbus TCP',
      id: 'modbus-sunspec',
      icon: <Zap size={14} aria-hidden="true" />,
      desc: t('monitoring.adapterModbusDesc'),
    },
    {
      name: t('monitoring.adapterKnxName'),
      protocol: 'KNXnet/IP',
      id: 'knx',
      icon: <Server size={14} aria-hidden="true" />,
      desc: t('monitoring.adapterKnxDesc'),
    },
    {
      name: t('monitoring.adapterOcppName'),
      protocol: 'OCPP/WS',
      id: 'ocpp',
      icon: <Zap size={14} aria-hidden="true" />,
      desc: t('monitoring.adapterOcppDesc'),
    },
    {
      name: t('monitoring.adapterEebusName'),
      protocol: 'SPINE/SHIP',
      id: 'eebus',
      icon: <Shield size={14} aria-hidden="true" />,
      desc: t('monitoring.adapterEebusDesc'),
    },
  ];
}

/** Static contrib-adapter definitions rendered in the adapter-health panel. */
export function buildContribAdapters(t: TFunction) {
  return [
    {
      name: t('monitoring.contribHomeAssistantMqtt'),
      protocol: 'MQTT/WS',
      id: 'homeassistant-mqtt',
      icon: <Server size={14} aria-hidden="true" />,
      desc: t('monitoring.contribHomeAssistantMqttDesc'),
    },
    {
      name: t('monitoring.contribMatterThread'),
      protocol: 'Matter/WS',
      id: 'matter-thread',
      icon: <Radio size={14} aria-hidden="true" />,
      desc: t('monitoring.contribMatterThreadDesc'),
    },
    {
      name: t('monitoring.contribZigbee2mqtt'),
      protocol: 'MQTT/WS',
      id: 'zigbee2mqtt',
      icon: <Wifi size={14} aria-hidden="true" />,
      desc: t('monitoring.contribZigbee2mqttDesc'),
    },
    {
      name: t('monitoring.contribShellyRest'),
      protocol: 'HTTP/REST',
      id: 'shelly-rest',
      icon: <Gauge size={14} aria-hidden="true" />,
      desc: t('monitoring.contribShellyRestDesc'),
    },
  ];
}
