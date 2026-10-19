// Shared numeric shape descriptions; safe for the relay to import (no renderer or physics engine).
export const VEHICLE_MODELS = {
  kestrel: { kind:'aircraft',width:12,length:17,roof:4,cabinRear:2,wheelbase:5 },
  skyliner: { kind:'aircraft',width:58,length:64,roof:13,cabinRear:12,wheelbase:18 },
  sparrow: { kind:'aircraft',width:9,length:7.4,roof:2.8,cabinRear:1.8,wheelbase:3.5 },
  tempest: { kind:'supercar',width:2.08,length:4.7,roof:.88,cabinRear:.55,wheelbase:2.95 },
  formula: { kind:'formula',width:1.92,length:5.05,roof:1.15,cabinRear:.5,wheelbase:3.2 },
  rider: { kind:'bike',width:.72,length:2.2,roof:1.8,cabinRear:.4,wheelbase:1.55 },
  cg125: { kind:'bike',width:.74,length:2.18,roof:1.8,cabinRear:.4,wheelbase:1.42 },
  swift: { kind:'scooter',width:.82,length:2.5,roof:1.8,cabinRear:.7,wheelbase:1.72 },
  vesper: { kind:'scooter',width:.76,length:2.18,roof:1.8,cabinRear:.6,wheelbase:1.48 },
  veloce: { kind: 'sedan', width: 1.91, length: 4.38, roof: 1.11, cabinRear: .92, wheelbase: 2.86 },
  marlin: { kind: 'sedan', width: 1.99, length: 4.64, roof: 1.07, cabinRear: .92, wheelbase: 3.0 },
  comet: { kind: 'hatch', width: 1.78, length: 3.75, roof: 1.18, cabinRear: 1.36, wheelbase: 2.5 },
  viper: { kind: 'sport', width: 2.02, length: 4.46, roof: .99, cabinRear: .6, wheelbase: 2.9 },
  nomad: { kind: 'suv', width: 2.08, length: 4.65, roof: 1.64, cabinRear: 1.62, wheelbase: 3.05 },
  hauler: { kind: 'pickup', width: 2.04, length: 5.1, roof: 1.43, cabinRear: .05, wheelbase: 3.42 },
  falcon: { kind: 'rally', width: 1.92, length: 4.12, roof: 1.2, cabinRear: .86, wheelbase: 2.7 },
};
export const vehicleId = id => Object.hasOwn(VEHICLE_MODELS, id) ? id : 'veloce';
export const modelOf = id => VEHICLE_MODELS[vehicleId(id)];
export const isTwoWheeler = id => ['bike','scooter'].includes(modelOf(id).kind);
export const isAircraft = id => modelOf(id).kind === 'aircraft';
export const vehicleForMap = (id, map) => map === 'skyport' ? (isAircraft(id) ? id : 'kestrel') : (isAircraft(id) ? 'veloce' : vehicleId(id));
export const VEHICLE_CATEGORIES = { all:'All', cars:'Cars', racing:'Racing Cars', bikes:'Bikes', scooters:'Scooters', aircraft:'Aircraft' };
export const categoryOf = id => {
  const kind = modelOf(id).kind;
  return kind === 'aircraft' ? 'aircraft' : kind === 'scooter' ? 'scooters' : kind === 'bike' ? 'bikes' : ['sport','supercar','formula','rally'].includes(kind) ? 'racing' : 'cars';
};
export const matchesCategory = (id, category) => category === 'all' || categoryOf(id) === category;
