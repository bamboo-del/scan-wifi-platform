import type { WechatMiniProgramApi } from "../platform/wechat-types";

declare global {
  const wx: WechatMiniProgramApi;

  function App<TOptions extends object>(options: TOptions): void;

  type MiniProgramPageContext<TData extends object, TMembers extends object> = TMembers & {
    readonly data: TData;
    setData(update: Partial<TData>): void;
  };

  function Page<TData extends object, TMembers extends object>(
    options: { data: TData } & TMembers & ThisType<MiniProgramPageContext<TData, TMembers>>,
  ): void;
}

export {};
