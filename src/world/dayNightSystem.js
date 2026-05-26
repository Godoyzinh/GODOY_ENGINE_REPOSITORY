const DAY_LENGTH_SECONDS = 240;
const INITIAL_TIME_OF_DAY = 0.28;

export class DayNightSystem {
  constructor({ dayLengthSeconds = DAY_LENGTH_SECONDS } = {}) {
    this.dayLengthSeconds = dayLengthSeconds;
    this.timeOfDay = INITIAL_TIME_OF_DAY;
    this.elapsedDays = 0;
    this.snapshot = this.createSnapshot();
  }

  update(deltaTime) {
    const previousTimeOfDay = this.timeOfDay;

    this.timeOfDay = (this.timeOfDay + deltaTime / this.dayLengthSeconds) % 1;

    if (this.timeOfDay < previousTimeOfDay) {
      this.elapsedDays += 1;
    }

    this.snapshot = this.createSnapshot();
  }

  createSnapshot() {
    const sunAngle = this.timeOfDay * Math.PI * 2;
    const daylight = clamp01(Math.sin(sunAngle) * 0.5 + 0.5);
    const isNight = this.timeOfDay < 0.18 || this.timeOfDay > 0.62;
    const nightIntensity = isNight ? 1 - daylight : 0;

    return {
      day: this.elapsedDays + 1,
      timeOfDay: this.timeOfDay,
      timeLabel: formatTimeLabel(this.timeOfDay),
      daylight,
      nightIntensity,
      isNight,
      hostileSpawnMultiplier: isNight ? 2.1 : 0.65,
      ambientPressure: isNight ? 0.35 + nightIntensity * 0.65 : 0.08,
    };
  }

  getSnapshot() {
    return this.snapshot;
  }
}

function formatTimeLabel(timeOfDay) {
  const totalMinutes = Math.floor(timeOfDay * 24 * 60);
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');

  return `${hours}:${minutes}`;
}

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}
