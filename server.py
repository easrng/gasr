#!/usr/bin/env python3
import asyncio
from struct import iter_unpack
import ctypes
from websockets import serve
from gasr import SodaClient

async def echo(websocket, *args):
    def handler(message, len, *args):
        msg=ctypes.string_at(message, len)
        if msg[1] == 1:
            asyncio.run(websocket.send(msg))
    client = SodaClient(handler)
    try:
        client.start()
        async for message in websocket:
            client.feed(message)
    except Exception as ex:
        print(ex)
        client.delete()

async def main():
    async with serve(echo, "localhost", 8765):
        await asyncio.Future()  # run forever

asyncio.run(main())
