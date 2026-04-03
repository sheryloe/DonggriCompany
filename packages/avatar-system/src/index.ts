import { AvatarSkin } from '@prn/core';
import { getDb, avatarSkins } from '@prn/db';
import { eq } from 'drizzle-orm';

export class AvatarManager {
  private db = getDb();

  async getAvatar(id: string): Promise<AvatarSkin | undefined> {
    const result = this.db.select().from(avatarSkins).where(eq(avatarSkins.id, id)).get();
    if (!result) return undefined;

    return {
      id: result.id,
      name: result.name,
      imageUrl: result.imageUrl,
      themeColor: result.themeColor,
      tags: result.tags as string[] || []
    };
  }

  async assignAvatarToProvider(providerName: string, roleName: string): Promise<AvatarSkin> {
    // 임시 휴리스틱 아바타 할당기
    const themeColor = providerName === 'claude' ? '#d97757'
                     : providerName === 'codex' ? '#10a37f'
                     : providerName === 'gemini' ? '#1c71d8'
                     : providerName === 'jules' ? '#9c27b0'
                     : '#aaaaaa';

    return {
      id: `${providerName}-${roleName}`,
      name: `${roleName} (${providerName})`,
      imageUrl: `/avatars/${providerName}.png`,
      themeColor,
      tags: [providerName, roleName]
    };
  }
}
