import { expect, test } from "bun:test"
import { toSrt, toVtt, wrap } from "../lib/captions"

const captions = [
  { startMs: 1500, endMs: 3000, text: "Bonjour" },
  {
    startMs: 3000,
    endMs: 3661_250,
    text: "Une légende très longue qui doit passer sur deux lignes de quarante caractères",
  },
]

test("srt has indexes, comma timestamps and wrapped lines of at most 42 characters", () => {
  const srt = toSrt(captions)
  expect(srt).toStartWith("1\n00:00:01,500 --> 00:00:03,000\nBonjour\n\n2\n00:00:03,000 --> 01:01:01,250\n")
  for (const line of wrap(captions[1]?.text ?? "").split("\n")) expect(line.length).toBeLessThanOrEqual(42)
})

test("vtt has the header and dot timestamps", () => {
  expect(toVtt(captions)).toStartWith("WEBVTT\n\n00:00:01.500 --> 00:00:03.000\nBonjour")
})
