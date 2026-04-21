import connectToDatabase from "./lib/database";
import { TimeSlot } from "./modules/booking/models/timeSlot";

const timeSlots = [
    { label: "9:00 AM – 10:00 AM", startTime: "09:00", endTime: "10:00", startMinutes: 540, endMinutes: 600, durationMinutes: 60, isActive: true },
    { label: "10:00 AM – 11:00 AM", startTime: "10:00", endTime: "11:00", startMinutes: 600, endMinutes: 660, durationMinutes: 60, isActive: true },
    { label: "11:00 AM – 12:00 PM", startTime: "11:00", endTime: "12:00", startMinutes: 660, endMinutes: 720, durationMinutes: 60, isActive: true },
    { label: "12:00 PM – 1:00 PM", startTime: "12:00", endTime: "13:00", startMinutes: 720, endMinutes: 780, durationMinutes: 60, isActive: true },
    { label: "1:00 PM – 2:00 PM", startTime: "13:00", endTime: "14:00", startMinutes: 780, endMinutes: 840, durationMinutes: 60, isActive: true },
    { label: "2:00 PM – 3:00 PM", startTime: "14:00", endTime: "15:00", startMinutes: 840, endMinutes: 900, durationMinutes: 60, isActive: true },
    { label: "3:00 PM – 4:00 PM", startTime: "15:00", endTime: "16:00", startMinutes: 900, endMinutes: 960, durationMinutes: 60, isActive: true },
    { label: "4:00 PM – 5:00 PM", startTime: "16:00", endTime: "17:00", startMinutes: 960, endMinutes: 1020, durationMinutes: 60, isActive: true },
];

async function seed() {
    await connectToDatabase();
    await TimeSlot.deleteMany({});
    await TimeSlot.insertMany(timeSlots);
    console.log("Seeded time slots");
    process.exit(0);
}

seed();