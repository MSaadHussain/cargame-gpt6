// Numeric-only aircraft tuning shared by flight, effects, gear and relay validation.
const SPECS={
  kestrel:{pitchRate:1.05,rollRate:2.2,yawRate:.55,maxSpeed:265,stallSpeed:55,landingSpeed:100,gearHeight:2.1,gearRadius:.42,gearWidth:1.6,gearFront:-4.5,gearRear:1.8,engine:'jet'},
  skyliner:{pitchRate:.38,rollRate:.65,yawRate:.22,maxSpeed:200,stallSpeed:65,landingSpeed:95,gearHeight:5.2,gearRadius:.9,gearWidth:5,gearFront:-22,gearRear:8,engine:'turbofan'},
  sparrow:{pitchRate:1.6,rollRate:3,yawRate:.7,maxSpeed:105,stallSpeed:28,landingSpeed:48,gearHeight:1.5,gearRadius:.32,gearWidth:1.1,gearFront:-1.7,gearRear:1.8,engine:'prop'},
};
export const aircraftSpec=id=>SPECS[id]||SPECS.kestrel;
// Slightly larger labels for readability; preserve distance falloff and compact sizing.
export const aircraftTagScale=(distance,own=false)=>own?.063:Math.max(.0168,Math.min(.084,.084*Math.sqrt(120/Math.max(120,distance))));
