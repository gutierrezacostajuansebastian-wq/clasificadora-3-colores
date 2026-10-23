/**
 * Mega 2560 pin assignment used by the firmware model, the 3D harness and the telemetry panel.
 *
 * NOTE: the original specification was cut off after "D32". Everything from D32 onwards is an assumption:
 *   D32 START, D33 RESET, D34 E-STOP (all INPUT_PULLUP), LCD1602 in 4-bit parallel mode on D40..D45.
 *   (The I2C backpack of v1 cannot be used: the Mega's SDA/SCL are D20/D21, which the spec assigns to Hall sensors.)
 */
export const PINS = {
  tcs: { s0: 22, s1: 23, s2: 24, s3: 25, out: 2 },
  verify: 3,
  hall: [18, 19, 20, 21, 4] as const, // Hall 1..5
  conv: { pwm: 5, in1: 6, in2: 7 },
  steer: { pwm: 8, in1: 9, in2: 10 },
  bridge: { pwm: 11, in1: 12, in2: 13 },
  tach: 14,
  btnUp: 30,
  btnDown: 31,
  btnStart: 32,
  btnReset: 33,
  btnEstop: 34,
  lcd: { rs: 40, en: 41, d4: 42, d5: 43, d6: 44, d7: 45 },
} as const

export const HALL_NAMES = [
  'H1 `//` LEFT',
  'H2 `||` CENTER',
  'H3 `\\\\` RIGHT',
  'H4 `_` BRIDGE FLAT',
  'H5 BRIDGE LIFTED',
] as const
