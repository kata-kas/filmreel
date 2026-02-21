import { REST, Routes } from "discord.js";
import { data as activeData } from "../src/bot/commands/active.js";
import { data as addfavData } from "../src/bot/commands/addfav.js";
import { data as addlistData } from "../src/bot/commands/addlist.js";
import { data as addseasonData } from "../src/bot/commands/addseason.js";
import { data as agreeData } from "../src/bot/commands/agree.js";
import { data as allData } from "../src/bot/commands/all.js";
import { data as allrecData } from "../src/bot/commands/allrec.js";
import { data as altData } from "../src/bot/commands/alt.js";
import { data as altrecData } from "../src/bot/commands/altrec.js";
import { data as avidData } from "../src/bot/commands/avid.js";
import { data as bycountryData } from "../src/bot/commands/bycountry.js";
import { data as bydirectorData } from "../src/bot/commands/bydirector.js";
import { data as byyearData } from "../src/bot/commands/byyear.js";
import { data as championData } from "../src/bot/commands/champion.js";
import { data as checklookupData } from "../src/bot/commands/checklookup.js";
import { data as circlejerkData } from "../src/bot/commands/circlejerk.js";
import { data as cleardeadlineData } from "../src/bot/commands/cleardeadline.js";
import { data as compareData } from "../src/bot/commands/compare.js";
import { data as controversialData } from "../src/bot/commands/controversial.js";
import { data as crownsData } from "../src/bot/commands/crowns.js";
import { data as deadlineData } from "../src/bot/commands/deadline.js";
import { data as delfavData } from "../src/bot/commands/delfav.js";
import { data as disagreeData } from "../src/bot/commands/disagree.js";
import { data as divisiveData } from "../src/bot/commands/divisive.js";
import { data as friendsData } from "../src/bot/commands/friends.js";
import { data as getlbData } from "../src/bot/commands/getlb.js";
import { data as getnickData } from "../src/bot/commands/getnick.js";
import { data as globetrotterData } from "../src/bot/commands/globetrotter.js";
import { data as helpData } from "../src/bot/commands/help.js";
import { data as isbusyData } from "../src/bot/commands/isbusy.js";
import { data as lbData } from "../src/bot/commands/lb.js";
import { data as levelData } from "../src/bot/commands/level.js";
import { data as listsData } from "../src/bot/commands/lists.js";
import { data as nicknamesData } from "../src/bot/commands/nicknames.js";
import { data as onthebubbleData } from "../src/bot/commands/onthebubble.js";
import { data as popData } from "../src/bot/commands/pop.js";
import { data as poprecData } from "../src/bot/commands/poprec.js";
import { data as profileData } from "../src/bot/commands/profile.js";
import { data as ratedData } from "../src/bot/commands/rated.js";
import { data as ratingData } from "../src/bot/commands/rating.js";
import { data as ratingsData } from "../src/bot/commands/ratings.js";
import { data as recData } from "../src/bot/commands/rec.js";
// Import all command data
import { data as registerData } from "../src/bot/commands/register.js";
import { data as rewardsData } from "../src/bot/commands/rewards.js";
import { data as rouletteData } from "../src/bot/commands/roulette.js";
import { data as scrapeData } from "../src/bot/commands/scrape.js";
import { data as scrapeunratedData } from "../src/bot/commands/scrapeunrated.js";
import { data as seenData } from "../src/bot/commands/seen.js";
import { data as serverlistsData } from "../src/bot/commands/serverlists.js";
import { data as setaniData } from "../src/bot/commands/setani.js";
import { data as setdeadlineData } from "../src/bot/commands/setdeadline.js";
import { data as setfmData } from "../src/bot/commands/setfm.js";
import { data as setlbData } from "../src/bot/commands/setlb.js";
import { data as setlevelroleData } from "../src/bot/commands/setlevelrole.js";
import { data as setnickData } from "../src/bot/commands/setnick.js";
import { data as setxpData } from "../src/bot/commands/setxp.js";
import { data as sheepData } from "../src/bot/commands/sheep.js";
import { data as studiosData } from "../src/bot/commands/studios.js";
import { data as xpData } from "../src/bot/commands/xp.js";
import { config } from "../src/config/index.js";

const commands = [
	registerData.toJSON(),
	setlbData.toJSON(),
	setnickData.toJSON(),
	getlbData.toJSON(),
	getnickData.toJSON(),
	nicknamesData.toJSON(),
	activeData.toJSON(),
	scrapeData.toJSON(),
	scrapeunratedData.toJSON(),
	isbusyData.toJSON(),
	lbData.toJSON(),
	altData.toJSON(),
	allData.toJSON(),
	popData.toJSON(),
	recData.toJSON(),
	altrecData.toJSON(),
	allrecData.toJSON(),
	poprecData.toJSON(),
	ratedData.toJSON(),
	seenData.toJSON(),
	onthebubbleData.toJSON(),
	ratingData.toJSON(),
	ratingsData.toJSON(),
	compareData.toJSON(),
	agreeData.toJSON(),
	disagreeData.toJSON(),
	friendsData.toJSON(),
	sheepData.toJSON(),
	divisiveData.toJSON(),
	circlejerkData.toJSON(),
	championData.toJSON(),
	controversialData.toJSON(),
	profileData.toJSON(),
	addfavData.toJSON(),
	delfavData.toJSON(),
	checklookupData.toJSON(),
	xpData.toJSON(),
	levelData.toJSON(),
	rewardsData.toJSON(),
	listsData.toJSON(),
	addlistData.toJSON(),
	serverlistsData.toJSON(),
	deadlineData.toJSON(),
	setdeadlineData.toJSON(),
	cleardeadlineData.toJSON(),
	addseasonData.toJSON(),
	setlevelroleData.toJSON(),
	setxpData.toJSON(),
	bydirectorData.toJSON(),
	bycountryData.toJSON(),
	byyearData.toJSON(),
	avidData.toJSON(),
	crownsData.toJSON(),
	globetrotterData.toJSON(),
	rouletteData.toJSON(),
	studiosData.toJSON(),
	setfmData.toJSON(),
	setaniData.toJSON(),
	helpData.toJSON(),
];

async function registerCommands() {
	const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

	try {
		console.log(
			`Started refreshing ${commands.length} application (/) commands.`,
		);

		// Register to guilds in development
		for (const guildId of config.GUILD_IDS) {
			const data = (await rest.put(
				Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, guildId),
				{ body: commands },
			)) as unknown[];
			console.log(
				`Successfully registered ${data.length} commands to guild ${guildId}`,
			);
		}
	} catch (error) {
		console.error("Error registering commands:", error);
		process.exit(1);
	}
}

registerCommands();
