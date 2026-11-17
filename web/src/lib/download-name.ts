const CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function generatedDownloadName(kind: "image" | "video" | "voice", extension: string) {
    const random = crypto.getRandomValues(new Uint32Array(10));
    let code = "";
    for (let i = 0; i < 10; i++) code += CODE_ALPHABET[random[i] % CODE_ALPHABET.length];
    return `oioi-${kind}-${code}.${extension}`;
}
