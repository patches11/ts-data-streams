
import express, { Express } from "express"
import request from "supertest"
import {RunningStream} from "./interfaces";
import {pushable, PushableInputResult} from "./stream-builder-base";

describe('Express Integration', () => {
  let app: Express
  let runningStream: RunningStream<PushableInputResult<string>>
  let allResults: string[]

  beforeEach(() => {
    app = express();
    allResults = []

    app.use(express.json());
    runningStream = pushable<string>()
      .mapAsync(1, async email => {
        return email + "1"
      })
      .run(async number => {
        allResults.push(number);
      });

    app.post("/send", async (req, res) => {
      await runningStream.inputConfig.push(req.body.email)
      return res.status(201).json({ data: req.body });
    });
  })

  test("example", async () => {
    await request(app)
      .post(`/send`)
      .expect("Content-Type", /json/)
      .send({
        email: "mendes@example.com",
      })
      .expect(201)

    await runningStream.cancel()
    await runningStream.completion

    expect(allResults).toEqual(["mendes@example.com1"])
  })
})