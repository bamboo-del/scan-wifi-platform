import * as React from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { createWifiPoster } from "@/lib/wifi-poster";
import type { QrCodeResponse } from "@/lib/types";

export function WifiPoster({
  storeName,
  qr,
}: {
  storeName: string;
  qr: QrCodeResponse;
}): React.JSX.Element {
  const [url, setUrl] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  React.useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  const preview = async (): Promise<void> => {
    setPending(true);
    try {
      const blob = await createWifiPoster(storeName, qr);
      if (mounted.current) setUrl(URL.createObjectURL(blob));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "海报生成失败");
    } finally {
      if (mounted.current) setPending(false);
    }
  };
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={pending || qr.status !== "active"}
        onClick={() => void preview()}
      >
        {pending ? "正在生成 WiFi 贴…" : "预览 WiFi 贴"}
      </Button>
      <Dialog
        open={url !== null}
        onOpenChange={(open) => {
          if (!open) setUrl(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>WiFi 贴预览</DialogTitle>
            <DialogDescription>修改 Wi-Fi 密码后，已打印的小程序码仍可使用。</DialogDescription>
          </DialogHeader>
          {url ? (
            <>
              <img src={url} alt={`${storeName} WiFi 贴`} className="mx-auto w-full max-w-72" />
              <Button asChild>
                <a href={url} download={`${storeName.replace(/[\\/:*?"<>|]/g, "-")}-WiFi贴.png`}>
                  保存图片
                </a>
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
