import { type FastifyPluginCallbackJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";
import { Temporal } from "temporal-polyfill";
import { toIsoString } from "@/utils/api";

const scheduleSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string", nullable: true },
    poster: { type: "string", nullable: true },
    date: { type: "string", format: "date-time" },
    startTime: { type: "string", format: "date-time" },
    endTime: { type: "string", format: "date-time" },
    channelId: { type: "string" },
    createdat: { type: "string", format: "date-time" },
    updatedat: { type: "string", format: "date-time" },
  },
  required: [
    "id",
    "name",
    "date",
    "startTime",
    "endTime",
    "channelId",
    "createdat",
    "updatedat",
  ],
};

const errorSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
  },
  required: ["message"],
};

const schedulesRoutes: FastifyPluginCallbackJsonSchemaToTs<{
  SerializerSchemaOptions: {
    deserialize: [
      {
        pattern: { type: "string"; format: "date-time" };
        output: Date | undefined | null;
      },
    ];
  };
}> = (fastify): void => {
  fastify.get(
    "",
    {
      schema: {
        tags: ["Schedules"],
        operationId: "listSchedules",
        summary: "List schedule entries for a channel",
        description:
          "Returns EPG schedule entries for a specific channel, ordered by start time. The channelId parameter is required so schedules are never listed across all channels. Optionally filter by a UTC date in YYYY-MM-DD format.",
        produces: ["application/json"],
        querystring: {
          type: "object",
          properties: {
            channelId: {
              type: "string",
              minLength: 1,
              description: "Channel ID whose schedule entries to return.",
            },
            date: {
              type: "string",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
              description: "Only return entries for this UTC day (YYYY-MM-DD).",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 500,
              description: "Maximum number of entries to return.",
            },
            offset: {
              type: "integer",
              minimum: 0,
              description: "Number of entries to skip.",
            },
          },
          required: ["channelId"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              schedules: {
                type: "array",
                items: scheduleSchema,
              },
            },
            required: ["schedules"],
          },
          400: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async function (request, reply) {
      try {
        const channel = await fastify.db.orm.public.Channel.where({
          id: request.query.channelId,
        }).first();

        if (!channel) {
          return reply.code(404).send({ message: "Channel not found." });
        }

        let query = fastify.db.orm.public.Schedule.where({
          channelId: request.query.channelId,
        });

        if (request.query.date) {
          let start;
          try {
            start = Temporal.Instant.from(`${request.query.date}T00:00:00Z`);
          } catch {
            return reply
              .code(400)
              .send({ message: "Invalid date. Use YYYY-MM-DD." });
          }
          const end = start.add({ hours: 24 });
          query = query
            .where((schedule) => schedule.date.gte(start))
            .where((schedule) => schedule.date.lt(end));
        }
        if (request.query.limit !== undefined) {
          query = query.limit(request.query.limit);
        }
        if (request.query.offset !== undefined) {
          query = query.offset(request.query.offset);
        }

        const schedules = await query
          .orderBy((schedule) => schedule.startTime.asc())
          .all();

        return {
          schedules: schedules.map((schedule) => ({
            ...schedule,
            date: toIsoString(schedule.date),
            startTime: toIsoString(schedule.startTime),
            endTime: toIsoString(schedule.endTime),
            createdat: toIsoString(schedule.createdat),
            updatedat: toIsoString(schedule.updatedat),
          })),
        };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ message: "Could not fetch schedule entries. Try again." });
      }
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["Schedules"],
        operationId: "getSchedule",
        summary: "Get a schedule entry",
        description: "Returns a single EPG schedule entry by its ID.",
        produces: ["application/json"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              minLength: 1,
              description: "Schedule entry ID.",
            },
          },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              schedule: scheduleSchema,
            },
            required: ["schedule"],
          },
          400: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async function (request, reply) {
      try {
        const schedule = await fastify.db.orm.public.Schedule.where({
          id: request.params.id,
        }).first();

        if (!schedule) {
          return reply.code(404).send({ message: "Schedule entry not found." });
        }

        return {
          schedule: {
            ...schedule,
            date: toIsoString(schedule.date),
            startTime: toIsoString(schedule.startTime),
            endTime: toIsoString(schedule.endTime),
            createdat: toIsoString(schedule.createdat),
            updatedat: toIsoString(schedule.updatedat),
          },
        };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ message: "Could not fetch the schedule entry. Try again." });
      }
    },
  );
};

export default schedulesRoutes;
