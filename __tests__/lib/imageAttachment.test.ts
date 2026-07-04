// makeThumbnail needs real <canvas>/<img> decoding (not in jsdom), so we mock
// it and test the read + downscale wiring of fileToAttachment.
jest.mock("@/lib/visionClient", () => ({
  makeThumbnail: jest.fn(async (dataUrl: string) => `thumb:${dataUrl}`),
}));

import { fileToAttachment } from "@/lib/imageAttachment";
import { makeThumbnail } from "@/lib/visionClient";

describe("fileToAttachment", () => {
  it("returns null for a non-image file", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    expect(await fileToAttachment(file)).toBeNull();
  });

  it("returns null when no file is given", async () => {
    expect(await fileToAttachment(undefined)).toBeNull();
  });

  it("reads an image file to a data URL and downscales it", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
    const result = await fileToAttachment(file);
    expect(result).toMatch(/^thumb:data:image\/png/);
    expect(makeThumbnail).toHaveBeenCalledWith(
      expect.stringMatching(/^data:image\/png/),
      1024,
      0.8,
    );
  });
});
