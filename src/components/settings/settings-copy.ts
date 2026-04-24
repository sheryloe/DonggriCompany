import type { TFunction } from "./types";

export function getSettingsCommonCopy(t: TFunction) {
  return {
    refresh: t({ ko: "새로고침", en: "Refresh" }),
    add: t({ ko: "추가", en: "Add" }),
    edit: t({ ko: "수정", en: "Edit" }),
    update: t({ ko: "업데이트", en: "Update" }),
    delete: t({ ko: "삭제", en: "Delete" }),
    cancel: t({ ko: "취소", en: "Cancel" }),
    close: t({ ko: "닫기", en: "Close" }),
    confirm: t({ ko: "확인", en: "Confirm" }),
    loading: t({ ko: "불러오는 중...", en: "Loading..." }),
    saving: t({ ko: "저장 중...", en: "Saving..." }),
    enabled: t({ ko: "활성", en: "Enabled" }),
    disabled: t({ ko: "비활성", en: "Disabled" }),
    enable: t({ ko: "활성화", en: "Enable" }),
    disable: t({ ko: "비활성화", en: "Disable" }),
    test: t({ ko: "테스트", en: "Test" }),
    receiver: t({ ko: "수신기", en: "Receiver" }),
    runtime: t({ ko: "런타임", en: "Runtime" }),
    models: t({ ko: "모델", en: "Models" }),
    searchModels: t({ ko: "모델 검색", en: "Search models" }),
    noResults: t({ ko: "검색 결과 없음", en: "No results" }),
    assign: t({ ko: "할당", en: "Assign" }),
    applied: t({ ko: "적용됨", en: "Applied" }),
    unassigned: t({ ko: "미할당", en: "Unassigned" }),
  };
}

export function getApiSettingsCopy(t: TFunction) {
  return {
    title: t({ ko: "API 제공자", en: "API Providers" }),
    intro: t({
      ko: "로컬, 프론티어, 호환 API를 등록하고 에이전트 실행에 연결합니다.",
      en: "Register local, frontier, and compatible APIs, then connect them to agent execution.",
    }),
    editProvider: t({ ko: "제공자 수정", en: "Edit Provider" }),
    addProvider: t({ ko: "새 제공자 추가", en: "Add New Provider" }),
    officialPresets: t({ ko: "공식 프리셋", en: "Official Presets" }),
    officialPresetsHelp: t({
      ko: "OpenCode Go와 Bailian Coding Plan 공식 프리셋입니다.",
      en: "Official presets for OpenCode Go and Bailian Coding Plan.",
    }),
    presetsLoading: t({ ko: "프리셋을 불러오는 중...", en: "Loading presets..." }),
    presetsFailed: t({ ko: "공식 프리셋을 불러오지 못했습니다.", en: "Official presets could not be loaded." }),
    openDocs: t({ ko: "문서 열기", en: "Open docs" }),
    genericType: t({ ko: "일반 유형", en: "Generic Type" }),
    genericTypeHelpLocked: t({
      ko: "일반 유형을 선택하면 프리셋 모드를 해제하고 수동 편집을 사용할 수 있습니다.",
      en: "Choose a generic type to leave preset mode and unlock manual editing.",
    }),
    genericTypeHelpManual: t({
      ko: "프로토콜과 Base URL을 직접 관리하려면 일반 유형을 사용하세요.",
      en: "Use a generic type when you want to manage protocol and Base URL yourself.",
    }),
    name: t({ ko: "이름", en: "Name" }),
    namePlaceholder: t({ ko: "예: My OpenAI", en: "e.g. My OpenAI" }),
    baseUrlManagedByPreset: t({
      ko: "선택한 프리셋이 프로토콜과 Base URL을 관리합니다.",
      en: "The selected preset manages the protocol and Base URL.",
    }),
    usuallyNotNeededForLocal: t({ ko: "로컬 환경에서는 보통 필요하지 않음", en: "usually not needed for local" }),
    changeApiKeyPlaceholder: t({ ko: "변경하려면 입력 (비우면 유지)", en: "Enter to change (blank=keep)" }),
    noProviders: t({
      ko: "등록된 API 제공자가 없습니다. 위의 추가 버튼으로 시작하세요.",
      en: "No API providers registered. Click Add above to get started.",
    }),
    testConnection: t({ ko: "연결 테스트", en: "Test Connection" }),
    assignToAgent: t({ ko: "에이전트에 할당", en: "Assign to agent" }),
  };
}

export function getGatewaySettingsCopy(t: TFunction) {
  return {
    title: t({ ko: "채널 메시지 설정", en: "Channel Messaging" }),
    intro: t({
      ko: "이 탭에서 메신저 채널을 설정합니다. 현재 텔레그램은 단일 그룹 모드로 동작합니다.",
      en: "Configure messenger channels in this tab. Telegram currently runs in single-group mode.",
    }),
    chatSessions: t({ ko: "채팅 세션", en: "Chat Sessions" }),
    addChat: t({ ko: "채팅 추가", en: "Add Chat" }),
    noChats: t({
      ko: "등록된 채팅이 없습니다. 채팅 추가로 메신저, 토큰, 채널을 등록하세요.",
      en: "No chats yet. Use Add Chat to register messenger, token, and channel.",
    }),
    noToken: t({ ko: "토큰 없음", en: "No token" }),
    native: t({ ko: "직접 연결", en: "Native" }),
    compat: t({ ko: "호환 설정", en: "Compat" }),
    assignedAgent: t({ ko: "연결 에이전트", en: "Agent" }),
    noAssignedAgent: t({ ko: "연결된 에이전트 없음", en: "No agent assigned" }),
    directiveRoutingHelp: t({
      ko: "$로 시작하면 회사 지시가 되고, 일반 메시지는 선택한 에이전트에게 1:1로 전달됩니다.",
      en: "Messages starting with $ become company directives; normal messages go 1:1 to the selected agent.",
    }),
    testSend: t({ ko: "테스트 전송", en: "Test Send" }),
    telegramReceiver: t({ ko: "텔레그램 수신기", en: "Telegram Receiver" }),
    discordReceiver: t({ ko: "디스코드 수신기", en: "Discord Receiver" }),
    allowedChats: t({ ko: "허용된 채팅 수", en: "Allowed chats" }),
    polledChannels: t({ ko: "폴링 채널 수", en: "Polled channels" }),
    targetSession: t({ ko: "대상 세션", en: "Target Session" }),
    noSavedSession: t({
      ko: "저장된 세션이 없습니다. 먼저 채팅을 추가하세요.",
      en: "No saved session. Add a chat first.",
    }),
    testMessagePlaceholder: t({ ko: "테스트 메시지를 입력하세요...", en: "Type a test message..." }),
    transportNotReady: t({
      ko: "이 채널은 설정과 매핑은 가능하지만 직접 전송 런타임은 아직 준비되지 않았습니다.",
      en: "This channel can be configured and mapped, but direct transport runtime is not ready yet.",
    }),
    send: t({ ko: "메시지 전송", en: "Send" }),
    sending: t({ ko: "전송 중...", en: "Sending..." }),
    messageSent: t({ ko: "메시지 전송 완료", en: "Message sent" }),
    channelSettingsSaved: t({ ko: "채널 설정 저장 완료", en: "Channel settings saved" }),
    chatDeleted: t({ ko: "채팅 삭제 완료", en: "Chat deleted" }),
    chatSaved: t({ ko: "채팅 저장 완료", en: "Chat saved" }),
    tokenRequired: t({ ko: "토큰을 입력해 주세요.", en: "Please enter a token." }),
    chatNameRequired: t({ ko: "채팅 이름을 입력해 주세요.", en: "Please enter a chat name." }),
    targetIdRequired: t({ ko: "채널 또는 대상 ID를 입력해 주세요.", en: "Please enter a channel or target ID." }),
    saveChatFailed: t({
      ko: "채팅 저장에 실패했습니다. 다시 시도해 주세요.",
      en: "Failed to save chat. Please try again.",
    }),
    runtimeSessions: t({ ko: "런타임 세션", en: "Runtime Sessions" }),
    singleGroupMode: t({ ko: "단일 그룹 모드", en: "Single Group Mode" }),
    editGlobalChat: t({ ko: "전역 그룹 설정", en: "Edit Global Group" }),
    globalSessionName: t({ ko: "전역 텔레그램 그룹", en: "Global Telegram Group" }),
    singleGroupNotice: t({
      ko: "부서 구분은 채널 분리가 아니라 메시지 헤더 태그로 처리됩니다.",
      en: "Department routing uses message header tags in one shared group.",
    }),
  };
}

export function getOauthSettingsCopy(t: TFunction) {
  return {
    title: t({ ko: "OAuth 인증 현황", en: "OAuth Status" }),
    connectFailed: t({ ko: "OAuth 연결 실패", en: "OAuth connection failed" }),
    connected: t({ ko: "연결 완료", en: "connected" }),
    storageReady: t({
      ko: "OAuth 저장소 활성 (암호화 키 설정됨)",
      en: "OAuth storage is active (encryption key configured)",
    }),
    storageMissing: t({
      ko: "OAUTH_ENCRYPTION_SECRET 환경변수가 설정되지 않았습니다.",
      en: "OAUTH_ENCRYPTION_SECRET is not set.",
    }),
    connectionStatus: t({ ko: "연결 상태", en: "Connection Status" }),
    cliDetected: t({ ko: "CLI 감지됨", en: "CLI detected" }),
    detectedNotRunnable: t({ ko: "감지됨 (실행 불가)", en: "Detected (not runnable)" }),
    autoRefreshed: t({ ko: "자동 갱신됨", en: "Auto-refreshed" }),
    refreshFailed: t({ ko: "갱신 실패", en: "Refresh failed" }),
    expiredReauth: t({ ko: "만료 - 재인증 필요", en: "Expired - re-auth needed" }),
    expired: t({ ko: "만료됨", en: "Expired" }),
    reconnect: t({ ko: "다시 연결", en: "Reconnect" }),
    disconnecting: t({ ko: "연결 해제 중...", en: "Disconnecting..." }),
    disconnect: t({ ko: "연결 해제", en: "Disconnect" }),
    cliCredentialWarning: t({
      ko: "CLI에서 감지한 자격 증명은 Claw-Empire 실행에 직접 사용하지 않습니다. Web OAuth로 다시 연결하세요.",
      en: "CLI-detected credentials are not used directly for Claw-Empire execution. Reconnect with Web OAuth.",
    }),
    scope: t({ ko: "권한 범위", en: "Scope" }),
    expires: t({ ko: "만료 시각", en: "Expires" }),
    created: t({ ko: "등록 시각", en: "Created" }),
    providerDefaultModel: t({ ko: "Provider 기본 모델", en: "Provider Default Model" }),
    selectPlaceholder: t({ ko: "선택하세요...", en: "Select..." }),
    noModelsAvailable: t({ ko: "사용 가능한 모델이 없습니다", en: "No models available" }),
    copilotSubscriptionHint: t({
      ko: "모델 실행에는 GitHub Copilot 구독이 필요합니다. 저장소 가져오기만 필요하면 무시해도 됩니다.",
      en: "Model execution requires a GitHub Copilot subscription. Ignore this if you only need repository import.",
    }),
    executionAccountPool: t({ ko: "실행 계정 풀", en: "Execution Account Pool" }),
    accountPoolHint: t({
      ko: "여러 활성 계정을 지원합니다. priority 숫자가 낮을수록 먼저 시도합니다.",
      en: "Multiple active accounts are supported. Lower priority values run first.",
    }),
    active: t({ ko: "활성", en: "Active" }),
    standby: t({ ko: "대기", en: "Standby" }),
    runnable: t({ ko: "실행 가능", en: "Runnable" }),
    notRunnable: t({ ko: "실행 불가", en: "Not runnable" }),
    label: t({ ko: "라벨", en: "Label" }),
    accountAlias: t({ ko: "계정 별칭", en: "Account alias" }),
    modelOverride: t({ ko: "모델 오버라이드", en: "Model Override" }),
    useProviderDefault: t({ ko: "Provider 기본값 사용", en: "Use provider default" }),
    priority: t({ ko: "우선순위", en: "Priority" }),
    poolOff: t({ ko: "풀 비활성", en: "Pool Off" }),
    poolOn: t({ ko: "풀 활성", en: "Pool On" }),
    save: t({ ko: "저장", en: "Save" }),
    executionAccounts: t({ ko: "실행 계정 연결", en: "Execution Accounts" }),
    encryptionKeyRequired: t({ ko: "암호화 키 필요", en: "Encryption key required" }),
    executionReady: t({ ko: "실행 준비 완료", en: "Execution Ready" }),
    reauthRequired: t({ ko: "재연결 필요", en: "Re-auth Required" }),
    connectable: t({ ko: "연결 가능", en: "Connectable" }),
    waitingDeviceCode: t({ ko: "기기 코드를 입력하는 중입니다...", en: "Waiting for device-code confirmation..." }),
    connect: t({ ko: "연결", en: "Connect" }),
    addAccount: t({ ko: "계정 추가", en: "Add Account" }),
    githubAccountConnected: t({ ko: "GitHub 실행 계정 연결 완료", en: "GitHub execution account connected" }),
    githubAccountConnectedHelp: t({
      ko: "Copilot 구독이 있으면 AI 모델 실행에 사용하고, 구독이 없어도 GitHub 가져오기와 저장소 연결은 계속 사용할 수 있습니다.",
      en: "If you have Copilot, it is used for AI execution. Without it, GitHub import and repository linking still work.",
    }),
  };
}
