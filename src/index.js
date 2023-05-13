import { spawn } from "child_process";
import Pbf from "pbf";
import { Readable } from "stream";

function makeReader(stream) {
  let buffer = new Uint8Array(0);
  let done = false;
  let pending = [];
  stream.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    buffer = new Uint8Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );
    if (pending.length > 0) {
      const current = pending;
      pending = [];
      for (const callback of current) {
        callback();
      }
    }
  });
  stream.on("end", () => {
    done = true;
  });
  return async function read(bytes) {
    if (buffer.byteLength === bytes) {
      const toReturn = buffer;
      buffer = new Uint8Array(0);
      return toReturn;
    }
    if (buffer.byteLength > bytes) {
      const toReturn = buffer.slice(0, bytes);
      buffer = buffer.slice(bytes);
      return toReturn;
    }
    if (done) throw new Error("EOF");
    await new Promise((cb) => pending.push(cb));
    return read(bytes);
  };
}

import {
  ExtendedSodaConfigMsg,
  SodaResponse,
  SodaRecognitionResult,
} from "./soda_api.js";

const CHANNEL_COUNT = 1;
const SAMPLE_RATE = 16000;
const CHUNK_SIZE = 2048; // 2 chunks per frame, a frame is a single s16

class SodaClient {
  constructor() {
    const cfg_proto = new Pbf();
    ExtendedSodaConfigMsg.write(
      {
        channel_count: CHANNEL_COUNT,
        sample_rate: SAMPLE_RATE,
        api_key: "ce04d119-129f-404e-b4fe-6b913fffb6cb",
        language_pack_directory: "./SODAModels/",
      },
      cfg_proto
    );
    const cfg_serialized = cfg_proto.finish();
    this.inner = spawn(new URL("../bin/gasr_inner", import.meta.url).pathname);
    this.inner.stderr.pipe(process.stderr);
    this.inner.stdin.write(
      Buffer.concat([
        new Uint8Array([
          cfg_serialized.length >> 24,
          cfg_serialized.length >> 16,
          cfg_serialized.length >> 8,
          cfg_serialized.length,
        ]),
        cfg_serialized,
      ])
    );
  }

  async start() {
    return Promise.all([
      (async () => {
        const read = makeReader(process.stdin);
        while (1) {
          const chunk = await read(2048);
          this.inner.stdin.write(
            Buffer.concat([
              new Uint8Array([
                chunk.length >> 24,
                chunk.length >> 16,
                chunk.length >> 8,
                chunk.length,
              ]),
              chunk,
            ])
          );
        }
      })(),
      (async () => {
        const read = makeReader(this.inner.stdout);
        while (1) {
          const toRead = Buffer.from(await read(4)).readUInt32BE();
          this.resultHandler(await read(toRead));
        }
      })(),
    ]);
  }

  delete() {
    this.inner.kill();
  }

  resultHandler(response) {
    const pbf = new Pbf(response);
    const res = SodaResponse.read(pbf);
    if (res.soda_type === SodaResponse.SodaMessageType.RECOGNITION) {
      const hypothesis = res.recognition_result.hypothesis[0];
      if (
        res.recognition_result.result_type ===
        SodaRecognitionResult.ResultType.FINAL
      ) {
        console.log(`* ${hypothesis}`);
      } else if (
        res.recognition_result.result_type ===
        SodaRecognitionResult.ResultType.PARTIAL
      ) {
        process.stdout.write(`* ${hypothesis}\r`);
      }
    }
  }
}

const client = new SodaClient();
try {
  await client.start();
} catch (err) {
  client.delete();
}
