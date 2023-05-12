#!/usr/bin/env python3
import sys, subprocess, os, struct
from soda_api_pb2 import ExtendedSodaConfigMsg, SodaResponse, SodaRecognitionResult

CHANNEL_COUNT = 1
SAMPLE_RATE = 16000
CHUNK_SIZE = 2048  # 2 chunks per frame, a frame is a single s16


class SodaClient:
    def __init__(self):
        cfg_proto = ExtendedSodaConfigMsg()
        cfg_proto.channel_count = CHANNEL_COUNT
        cfg_proto.sample_rate = SAMPLE_RATE
        cfg_proto.api_key = "ce04d119-129f-404e-b4fe-6b913fffb6cb"
        cfg_proto.language_pack_directory = "./SODAModels/"
        cfg_serialized = cfg_proto.SerializeToString()
        self.inner = subprocess.Popen(
            ["bin/gasr_inner"], stdin=subprocess.PIPE, stdout=subprocess.PIPE
        )
        self.inner.stdin.write(len(cfg_serialized).to_bytes(4, "big"))
        self.inner.stdin.write(cfg_serialized)

    def start(self):
        while True:
            audio = sys.stdin.buffer.read(CHUNK_SIZE)
            self.inner.stdin.write(len(audio).to_bytes(4, "big"))
            self.inner.stdin.write(audio)
            os.set_blocking(self.inner.stdout.fileno(), False)
            try:
                to_read = self.inner.stdout.read(4)
            finally:
                os.set_blocking(self.inner.stdout.fileno(), True)
            if to_read:
                self.resultHandler(
                    self.inner.stdout.read(struct.unpack("!I", to_read)[0])
                )

    def delete(self):
        self.inner.kill()

    def resultHandler(self, response):
        res = SodaResponse()
        res.ParseFromString(response)
        if res.soda_type == SodaResponse.SodaMessageType.RECOGNITION:
            if (
                res.recognition_result.result_type
                == SodaRecognitionResult.ResultType.FINAL
            ):
                print(f"* {res.recognition_result.hypothesis[0]}")
            elif (
                res.recognition_result.result_type
                == SodaRecognitionResult.ResultType.PARTIAL
            ):
                print(f"* {res.recognition_result.hypothesis[0]}", end="\r")


if __name__ == "__main__":
    client = SodaClient()
    try:
        client.start()
    except KeyboardInterrupt:
        client.delete()
