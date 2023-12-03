const fetch = require('node-fetch');
const { Telegraf } = require('telegraf');
const moment = require('moment');

const bot = new Telegraf('6432095100:AAEB7Hbx5-mLiMO5V_UdRvh-15wZreLn2-4');

const dextoolsEndpoint = 'https://open-api.dextools.io/free/v2/ranking';
const chainId = 'ether';

const PAGE_SIZE = 5;
let formattedProjects = [];
let currentPage = 0;
let topProjectsDextools = [];

// Function to fetch FDV with rate limiting
async function fetchFDVWithRateLimit(address) {
  const options = {
    method: 'GET',
    headers: {
      'X-BLOBR-KEY': 'ai3yLMqvf0SLo4JJRSFicJwpG9LxHAIR',
    },
  };

  try {
    const response = await fetch(`https://open-api.dextools.io/free/v2/token/${chainId}/${address}/info`, options);
    const data = await response.json();

    if (data && data.data && data.data.fdv !== undefined) {
      // Record the timestamp along with the FDV value
      const timestamp = Date.now();
      return { fdv: data.data.fdv, timestamp };
    } else {
      console.error('Error fetching FDV: Unexpected response format', data);
      return 'N/A';
    }
  } catch (error) {
    console.error('Error fetching FDV:', error.message);
    return 'N/A';
  }
}

// Function to fetch FDV with rate limiting and retries
async function fetchFDVWithRetries(address, maxRetries = 3) {
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      const fdv = await fetchFDVWithRateLimit(address);
      if (fdv !== 'N/A') {
        return fdv;
      }
    } catch (error) {
      console.error(`Retry ${retry + 1} failed:`, error.message);
    }
  }

  return 'N/A';
}

// Callback handler for "next" action
bot.action('next', async (ctx) => {
  try {
    // Increase currentPage to fetch the next set of projects
    currentPage++;

    const startIndex = currentPage * PAGE_SIZE;
    const endIndex = (currentPage + 1) * PAGE_SIZE;

    // Fetch FDV for the next set of projects
    const fdvPromises = topProjectsDextools.slice(startIndex, endIndex).map(async (project) => {
      const { fdv, timestamp } = await fetchFDVWithRetries(project.mainToken.address);
      return {
        rank: project.rank,
        name: project.mainToken.name,
        price: `$${project.price.toFixed(8)}`,
        roi24h: `${project.variation24h.toFixed(2)}%`,
        creationTime: moment(project.creationTime).fromNow(),
        exchange: project.exchange.name,
        mainTokenAddress: project.mainToken.address.toLowerCase(),
        fdv,
        timestamp,
      };
    });

    const newFormattedProjects = await Promise.all(fdvPromises);

    formattedProjects = formattedProjects.concat(newFormattedProjects);

    // Display the next set of projects
    displayProjects(ctx);

  } catch (error) {
    console.error('Error fetching next set of projects:', error.message);
    ctx.reply('An error occurred while fetching the next set of projects. Please try again later.');
  }
});

// Function to fetch new listings from Dextools API
async function fetchDextoolsData() {
  const response = await fetch(`${dextoolsEndpoint}/${chainId}/gainers`, {
    method: 'GET',
    headers: {
      'X-BLOBR-KEY': 'ai3yLMqvf0SLo4JJRSFicJwpG9LxHAIR',
    },
  });

  const data = await response.json();
  return Array.isArray(data.data) ? data.data.slice(0, 10) : [];
}

// Command to fetch and display top projects
bot.command('top', async (ctx) => {
  try {
    // Fetch new listings from Dextools API
    topProjectsDextools = await fetchDextoolsData();

    console.log('Dextools data fetched successfully');

    // Fetch the FDV for the first 5 projects initially
    const fdvPromises = topProjectsDextools.slice(0, PAGE_SIZE).map(async (project) => {
      const { fdv, timestamp } = await fetchFDVWithRetries(project.mainToken.address);
      return {
        rank: project.rank,
        name: project.mainToken.name,
        price: `$${project.price.toFixed(8)}`,
        roi24h: `${project.variation24h.toFixed(2)}%`,
        creationTime: moment(project.creationTime).fromNow(),
        exchange: project.exchange.name,
        mainTokenAddress: project.mainToken.address.toLowerCase(),
        fdv,
        timestamp,
      };
    });

    formattedProjects = await Promise.all(fdvPromises);

    // Display the first 5 projects
    displayProjects(ctx);

  } catch (error) {
    console.error('Error fetching data:', error.message);
    ctx.reply('An error occurred while fetching data. Please try again later.');
  }
});

// Helper function to display projects
function displayProjects(ctx) {
  const startIndex = currentPage * PAGE_SIZE;
  const endIndex = (currentPage + 1) * PAGE_SIZE;

  const responseText = formattedProjects.slice(startIndex, endIndex).map((project) => (
    `---------------------------------------------------------------------\n` +
    `🏆 Rank: ${project.rank} 🏅\n` +
    `🪧 Name: ${project.name} ✨\n` +
    `💵 Price: ${project.price} 💸\n` +
    `📈 ROI 24h: ${project.roi24h} 💹\n` +
    `❄️ MCap: ${formatFDV(project.fdv)}\n` +
    `🚀 Launched: ${project.creationTime} ⏰\n` +
    `🚧 Dex: ${project.exchange} 🦄\n` +
    `🪙 CA: <code>${project.mainTokenAddress}</code>\n` + 
    `🔍 <a href="https://dextools.io/token/${project.mainTokenAddress}">Etherscan</a> 🔗\n` +
    `\n`
)).join('');

  const buttons = [];

  if (currentPage > 0) {
    buttons.push({ text: 'Previous', callback_data: 'prev' });
  }

  if ((currentPage + 1) * PAGE_SIZE < topProjectsDextools.length) {
    buttons.push({ text: 'Next', callback_data: 'next' });
  }

  const keyboard = {
    inline_keyboard: [buttons],
  };

  ctx.reply(`Top 10 new listings details from Dextools\n${responseText}`, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

// Command to analyze and display projects that crossed 1 million FDV within 3 days
bot.command('analyse', async (ctx) => {
  try {
    // Fetch top 20 projects directly from Dextools API
    topProjectsDextools = await fetchDextoolsData();

    console.log('Dextools data fetched successfully');

    // Fetch FDV and creation time for the top projects
    const projectDetailsPromises = topProjectsDextools.map(async (project) => {
      const [fdvResponse, creationTimeResponse] = await Promise.all([
        fetchFDVWithRetries(project.mainToken.address),
        fetchProjectCreationTime(project.mainToken.address),
      ]);

      const { fdv, timestamp } = fdvResponse;
      const creationTime = creationTimeResponse ? creationTimeResponse.creationTime : null;

      return {
        name: project.mainToken.name,
        fdv,
        timestamp,
        creationTime,
      };
    });

    const projectDetails = await Promise.all(projectDetailsPromises);

    // Filter projects that have more than 1000000 FDV or equal
    const highFDVProjects = projectDetails.filter((project) => (
      project.fdv >= 1000000
    ));

    if (highFDVProjects.length === 0) {
      ctx.reply('No projects with more than 1 million MarketCap.');
      return;
    }

    // Sort projects by timestamp (crossing 1 million FDV time)
    highFDVProjects.sort((a, b) => a.timestamp - b.timestamp);

    // Display the top 20 projects that have more than 1 million FDV
    const responseText = highFDVProjects.slice(0, 20).map((project) => {
      return (
        `\n-| Name: ${project.name} ✨` +
        `\n-| FDV: ${formatFDV(project.fdv)}` +
        `\n---------------------------------------------------------------`
      );
    }).join('');

    ctx.reply(`Top projects with more than 1 million MarketCap\n${responseText}`);
  } catch (error) {
    console.error('Error analyzing projects:', error.message);
    ctx.reply('An error occurred while analyzing projects. Please try again later.');
  }
});

// Function to fetch creation time of a project
async function fetchProjectCreationTime(address) {
  const response = await fetch(`https://open-api.dextools.io/free/v2/pool/${chainId}/${address}`, {
    method: 'GET',
    headers: {
      'X-BLOBR-KEY': 'ai3yLMqvf0SLo4JJRSFicJwpG9LxHAIR',
    },
  });

  const data = await response.json();

  if (data && data.data && data.data.created_at) {
    return { creationTime: data.data.created_at };
  } else {
    console.error('Error fetching creation time: Unexpected response format');
    return null;
  }
}

// Function to format FDV in a human-readable format
function formatFDV(fdv) {
  if (fdv === 'N/A') {
    return 'N/A';
  }

  const thousand = 100000;
  const million = 1000000;
  const billion = 1000000000;
  const trillion = 1000000000000;

  if (fdv < thousand) {
    return `$${fdv.toFixed(2)}`;
  } else if (fdv < million) {
    return `$${(fdv / thousand).toFixed(2)}K`;
  } else if (fdv < billion) {
    return `$${(fdv / million).toFixed(2)} Million`;
  } else if (fdv < trillion) {
    return `$${(fdv / billion).toFixed(2)} Billion`;
  } else {
    return `$${(fdv / trillion).toFixed(2)} Trillion`;
  }
}

bot.launch();