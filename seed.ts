import connectToDatabase from "./lib/database";
import { Room } from "./modules/room/models/room";

async function seed() {
    await connectToDatabase();

    await Room.deleteMany({});

    const rooms = Array.from({ length: 15 }, (_, i) => ({
        roomNumber: String(i + 1),
        capacity: 2,
        isActive: true,
    }));

    await Room.insertMany(rooms);
    console.log("Seeded 15 rooms");
    process.exit(0);
}

seed();