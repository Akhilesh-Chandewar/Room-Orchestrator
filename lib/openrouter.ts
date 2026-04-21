let cachedModels: string[] = [];
let lastFetch = 0;

const CACHE_TTL = 10 * 60 * 1000; // 10 min

export async function getFreeModels(): Promise<string[]> {
    const now = Date.now();

    if (cachedModels.length && now - lastFetch < CACHE_TTL) {
        return cachedModels;
    }

    const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
    });

    if (!res.ok) throw new Error("Failed to fetch models");

    const data = await res.json();

    const freeModels = data.data
        .filter((model: any) => {
            const prompt = parseFloat(model.pricing?.prompt ?? "0");
            const completion = parseFloat(model.pricing?.completion ?? "0");

            return (
                prompt === 0 &&
                completion === 0 &&
                model.id.includes("instruct") // filter good models
            );
        })
        .map((m: any) => m.id);

    // prioritize better models
    cachedModels = freeModels.sort((a: string) => {
        if (a.includes("llama")) return -1;
        if (a.includes("mistral")) return -1;
        return 1;
    });

    lastFetch = now;

    return cachedModels;
}