import { Navbar } from "@/modules/home/components/Navbar";
import { RoomView } from "@/modules/home/components/RoomView";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="pt-14 flex h-[calc(100vh-3.5rem)]">
        <div className="w-1/2 p-4 overflow-auto">
          <RoomView />
        </div>
        <div className="w-1/2 p-4">
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Chat window (placeholder)
          </div>
        </div>
      </main>
    </>
  );
}
