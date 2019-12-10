const puppeteer = require('puppeteer');
const printMessage = require('print-message');
const fs = require('fs');
const arguments = process.argv.slice(2);
//*************MAIN FUNCTIONS********************/
const companyFiles = fs.readdirSync('./companies');
const resultFiles = fs.readdirSync('./results');

const launch = async () => {
	return await puppeteer.launch({
		headless: true,
		defaultViewport: {
			width: 1200,
			height: 750
		}
	});
}

const openCompanyPage = async (url,browser) => {
	const context = browser.defaultBrowserContext();
	const page = await context.newPage();
	await page.goto(url);
	await page.waitFor(2000);
	await page.reload();

	return page;
};

const getCompanyName = async page => {
	const element = await page.$('#searchDropdownBox [selected="selected"]');
	const name = await page.evaluate(element => element.textContent, element);
	const id = await page.evaluate(element => element.value.slice(3), element);

	return {
		name,
		id
	};
};

const getCompanyProducts = async (page, browser, url) => {
	printMessage(['Please wait....',
                 'Searching company products']);
	const getAsinLinks = async () =>
		await page.$$eval('div.a-section h2 .a-link-normal', el =>
			el.map(l => `https://www.amazon.com${l.getAttribute('href')}`)
		);
	let arr = await getAsinLinks();
	await page.click('li.a-last');
	await page.waitFor(2000);
	arr = [...arr, ...(await getAsinLinks())];
 //TODO check 2 pages
	const pagesNumber = await page.$eval(
		'ul.a-pagination .a-disabled',
		el => el.innerText
	);

	for (let i = 3; i <= +pagesNumber; i++) {
		page.goto(`${url}&page=${i}`);
		await page.waitFor(2000);
		arr = [...arr, ...(await getAsinLinks())];
	}

	await browser.close();

	return arr.map(link => {
		return { link, asin: link.match(/dp\/(.*)\/ref/)[1] };
	});
};

const compareProducts = (oldData, newData) => {
	return newData.filter(i => !oldData.includes(i));
};

/************************************CODE EXECUTION******************************/
launch().then(browser => {
	openCompanyPage(arguments[0], browser).then(page => {
		getCompanyName(page).then(company => {
			getCompanyProducts(page, browser, arguments[0]).then(links => {
				const previousFile = companyFiles.find(i =>
					i.includes(`${company.name}_${company.id}`)
				);
				if (previousFile) {
					const oldAsins = fs.readFileSync(`companies/${previousFile}`, 'utf8');
					fs.unlinkSync(`companies/${previousFile}`);
					const results = compareProducts(
						oldAsins,
						links.map(i => i.asin)
					);
					if (results.length !== 0) {
						const resultLinks = results.map(i => {
							return links.find(l => l.asin === i).link;
						});
						const oldResultFile = resultFiles.find(i =>
							i.includes(`${company.name}_${company.id}`)
						);
						if (oldResultFile) {
							fs.unlinkSync(`results/${oldResultFile}`);
						}
						fs.appendFileSync(
							`results/${company.name}_${
								company.id
							}_NewProducts_${new Date().toDateString()}.txt`,
							resultLinks.join('\n')
						);
						printMessage([`${company.name} has new products.`,
						             `You can find new products links in the "result" folder`]);
					} else {
						printMessage([`Company ${company.name} doesn't have a new products`,
					                   `Please try again later `]);
					}
				} else {
					printMessage([`Didn't find previous data for ${company.name} company`,
					              `Looks like it's your first searching for this company`,
					              `File with current pruducts was created in "companies" folder`]);
				}
				fs.appendFileSync(
					`companies/${company.name}_${company.id}_${new Date().toDateString()}.txt`,
					JSON.stringify(links, null, 2)
				);
			});
		});
	});
});

