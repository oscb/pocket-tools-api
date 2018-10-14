export const Timeslots = [
  '2:00',
  '6:00',
  '10:00',
  '14:00',
  '18:00',
  '22:00'
]

export const GetTimeSlot = (currentTime: Date) => {
  const nSlots = 6;
  const startTimeSlot = 2;
  const timeSlotInterval = 4;

  const hours = (currentTime.getHours() - startTimeSlot) % 24;
  const minutes = currentTime.getHours();

  for (let i = 0; i < nSlots; i++) {
    let limit = i * timeSlotInterval;
    if (hours < limit) {
      if (hours === limit && minutes > 0) {
        return i++;
      } else {
        return i;
      }
    }
  }
  return null;
}