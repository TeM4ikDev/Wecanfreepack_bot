import { UserCheckMiddleware } from '@/auth/strategies/telegram.strategy';
import { UsersService } from '@/users/users.service';
import { UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Action, Ctx, Start, Update } from 'nestjs-telegraf';
import * as path from 'path';
import { Context } from 'telegraf';
import { Language } from '../decorators/language.decorator';
import { LocalizationService } from '../services/localization.service';
import { TelegramService } from '../telegram.service';


@UseGuards(UserCheckMiddleware)
@Update()
export class MainMenuUpdate {
    private channels: string[] = ['TonUp_nft', 'wecanagency'];
    // private channels: string[] = ['testscambase', 'tem4ikdev'];
    private allowedStatuses = new Set(['creator', 'administrator', 'member']);

    // File ID видео после первой загрузки в Telegram
    // Временно null - будет получен при первой отправке
    private videoFileId: string | null = "BAACAgIAAxkDAANVaRzOZ4AP-BsMHvT4eblN0GBF6fsAAmOcAAJmLehIxOd0JVstIAs2BA";
    private startText = `Wecan Pack - набор инструментов для тех, кто не ждёт трендов, а создаёт их сам 🏅\n\nХочешь доступ к WECAN PACK? Подпишись на пару канала — и набор твой.`
    private dataShow = 'https://t.me/wecanpack/1'

    constructor(
        protected readonly telegramService: TelegramService,
        protected readonly configService: ConfigService,
        protected readonly userService: UsersService,
        private readonly localizationService: LocalizationService,
    ) { }

    createChannelsKeyboard() {
        const rows = this.channels.map((channel, index) => [
            { text: `Канал ${index + 1}`, url: `https://t.me/${channel}` },
        ]);

        return [...rows, [{ text: '✅ Готово', callback_data: 'channels_done' }]];
    }

    private getVideoPath(): string {
        return path.join(process.cwd(), 'public', 'bot.mp4');
    }

    private async getNotSubscribedChannels(ctx: Context): Promise<string[]> {
        if (!ctx.from) {
            return this.channels;
        }

        const results = await Promise.all(
            this.channels.map(async (channel) => {
                try {
                    const member = await ctx.telegram.getChatMember(`@${channel}`, ctx.from!.id);

                    console.log(member)

                    if (member.status === 'restricted') {
                        return 'is_member' in member && member.is_member ? null : channel;
                    }

                    return this.allowedStatuses.has(member.status) ? null : channel;
                } catch (error) {
                    console.warn(`Не удалось проверить подписку на канал ${channel}`, error);
                    return channel;
                }
            }),
        );

        return results.filter((channel): channel is string => Boolean(channel));
    }

    @Start()
    async onStart(@Ctx() ctx: Context, @Language() language: string) {
        const { user, isNew } = await this.userService.findOrCreateUser(ctx.from);

        if (this.videoFileId) {
            await ctx.replyWithVideo(this.videoFileId, {
                caption: this.startText,
                supports_streaming: true,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: this.createChannelsKeyboard()
                },
            });
            return;
        }

        const videoPath = this.getVideoPath();
        const videoFile = this.telegramService.getPhotoStream(videoPath);

        const sentMessage = await ctx.replyWithVideo(videoFile, {
            caption: this.startText,
            supports_streaming: true,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: this.createChannelsKeyboard()
            },
        } );

        if (sentMessage && 'video' in sentMessage && sentMessage.video) {
            this.videoFileId = sentMessage.video.file_id;
            console.log('✅ Получен file_id видео:', this.videoFileId);
            console.log('📝 Скопируйте этот file_id и замените videoFileId в коде для постоянного использования');
        }
    }

    @Action('channels_done')
    async onChannelsDone(@Ctx() ctx: Context) {
        await ctx.answerCbQuery();

        const notSubscribed = await this.getNotSubscribedChannels(ctx);

        if (notSubscribed.length) {
            const list = notSubscribed
                .map((channel, index) => `${index + 1}. @${channel}`)
                .join('\n');

            await ctx.reply(`❌ Необходимо подписаться на каналы:\n${list}\n\nПодпишитесь и нажмите "Готово" ещё раз.`);
            return;
        }

        await ctx.reply(`Держи, пользуйся на здоровье! Но только потом не забудь отблагодарить 😉\n\n${this.dataShow}`, {
            reply_markup: {
                inline_keyboard: [[{ text: '📝 Заполнить информацию', callback_data: 'fill_info_form' }]],
            },
        });
    }





}
