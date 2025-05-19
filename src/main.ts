import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import process from "node:process";
import { logger } from "hono/logger";
import z from "zod";

const homeAssistantState = z.object({
  entity_id: z.string(),
  state: z.string(),
  attributes: z.object({
    zone_id: z.string().optional(),
    friendly_name: z.string().optional(),
    user_soil_moisture_sensor_id: z.string().optional(),
    next_duration: z.string().optional(),
    next_start: z.string().optional(),
  }),
});

const homeAssistantStatesUrl = new URL(
  "/api/states",
  process.env.HOMEASSISTANT_URL
);

const app = new Hono();
app.use(logger());
app.get("/", async (c) => {
  const response = await fetch(homeAssistantStatesUrl, {
    headers: {
      Authorization: `Bearer ${process.env.HOMEASSISTANT_API_KEY}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    return c.text("Error fetching data from Home Assistant", 500);
  }

  const jsonResponse = await response.json();
  const states = z.array(homeAssistantState).parse(jsonResponse);
  const statesByEntityId = new Map<string, (typeof states)[number]>(
    states.map((state) => [state.entity_id, state])
  );

  const irrigationUnlimitedZones = states.filter(
    (state) =>
      state.entity_id.startsWith("binary_sensor.irrigation_unlimited_") &&
      state.attributes.zone_id
  );

  const zoneResponses = irrigationUnlimitedZones.map((zone) => {
    const soilMoistureSensorId = zone.attributes.user_soil_moisture_sensor_id;

    const soilMoistureSensorState =
      soilMoistureSensorId && statesByEntityId.get(soilMoistureSensorId)?.state;

    return {
      name: zone.attributes.friendly_name,
      nextStart: zone.attributes.next_start,
      nextDuration: zone.attributes.next_duration,
      soilMoisture: soilMoistureSensorState,
    };
  });

  return c.json(zoneResponses);
});

const port = process.env.PORT ? Number.parseInt(process.env.PORT) : 3000;
const server = serve({ fetch: app.fetch, port });

console.log(`Server running at http://localhost:${port}`);

process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.close((err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    process.exit(0);
  });
});
