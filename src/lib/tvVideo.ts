import { useEffect, useState } from 'react';
import { getVideo } from './photoStore.ts';

/**
 * The gallery video playing behind the big screen, resolved from its id.
 *
 * The blob never becomes a string. `createObjectURL` hands the `<video>` element a
 * handle the browser streams from disk, so a 40 MB file costs a handle rather than
 * 40 MB of JavaScript heap — which is the whole reason the video is stored as a
 * Blob and not as the data URL the photos use.
 *
 * Its own tone and focal point come back with it rather than being read from
 * `Settings.tvBackgroundTone` / `tvBackgroundFocus`. Those two are SYNCED: they
 * describe the picture the paired television is showing, and overwriting them with
 * the luminance of a video that television cannot see would dim the wrong screen.
 */
export interface BackgroundVideo {
  url: string;
  tone: number;
  focus: { x: number; y: number };
}

export function useBackgroundVideo(id: string | null): BackgroundVideo | null {
  const [video, setVideo] = useState<BackgroundVideo | null>(null);

  useEffect(() => {
    if (!id) {
      setVideo(null);
      return;
    }
    /* `dead` as well as revoking: the effect can be torn down while the lookup is
       still in flight, and setting state after that is a leak warning at best and
       a URL nobody ever revokes at worst. */
    let dead = false;
    let made: string | null = null;

    void getVideo(id).then((v) => {
      if (dead) return;
      if (!v) {
        // the id outlived the file — a restored backup, or storage cleared. The
        // big screen falls back to its picture background without comment.
        setVideo(null);
        return;
      }
      made = URL.createObjectURL(v.blob);
      setVideo({ url: made, tone: v.tone, focus: v.focus });
    });

    return () => {
      dead = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);

  return video;
}
