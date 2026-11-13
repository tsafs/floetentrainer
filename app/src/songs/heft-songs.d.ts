// Virtuelles Modul aus scripts/heft-songs-plugin.ts: die Rohdaten der Lieder aus heft/songs.py.
declare module "virtual:heft-songs" {
  import type { RawSong } from "./model";
  const songs: RawSong[];
  export default songs;
}
