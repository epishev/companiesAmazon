const puppeteer = require('puppeteer');
const printMessage = require('print-message');
const fs = require('fs');
const data = {
	launchConfig: {
		headless: false,
		defaultViewport: {
			width: 1200,
			height: 750
		}
	},
	locators: {
		geoPositionButton: '#nav-packard-glow-loc-icon',
		zipInput: '#GLUXZipUpdateInput',
		newYorkZip: '10258',
		applyZipButton: '[data-action="GLUXPostalUpdateAction"]',
		confirmZipButton: '#GLUXConfirmClose',
		searchDropDown: '#searchDropdownBox [selected="selected"]',
		productLink: 'div.a-section h2 .a-link-normal',
		paginationNextButton: 'li.a-last',
		paginationLastDisabledPageButton: 'ul.a-pagination .a-disabled',
		paginationNotDisabledButton: '.a-pagination li.a-normal a'
	}
};
//*************MAIN FUNCTIONS********************/
const urls = fs.readFileSync('./companies.txt', 'utf-8');
const args = urls.split('\n');
const companyFiles = fs.readdirSync('./companies');
const resultFiles = fs.readdirSync('./results');

const launch = async () => {
	return await puppeteer.launch(data.launchConfig);
};

const setUsaLocation = async (page, zip) => {
	await page.click(data.locators.geoPositionButton);
	await page.waitForSelector(data.locators.zipInput);
	await page.waitFor(2000);
	await page.type(data.locators.zipInput, zip, { delay: 300 });
	await page.click(data.locators.applyZipButton);
	await page.waitForSelector(data.locators.confirmZipButton);
	await page.waitFor(2000);
	await page.evaluate(() => {
		document.querySelector('#GLUXConfirmClose').click();
	});
	await page.waitFor(2000);
	await page.waitForSelector(data.locators.searchDropDown);
};

const openCompanyPage = async (url, browser) => {
	const page = await browser.newPage();
	await Promise.all([page.goto(url), page.waitForNavigation()]);
	await page.reload();
	await setUsaLocation(page, data.locators.newYorkZip);

	return page;
};

const getCompanyName = async page => {
	const element = await page.$(data.locators.searchDropDown);
	const name = await page.evaluate(element => element.textContent, element);
	const id = await page.evaluate(element => element.value.slice(3), element);

	return {
		name,
		id
	};
};

const getCompanyProducts = async (page, browser, url, companyName) => {
	printMessage([
		'Please wait....',
		`Searching products for ${companyName} company`
	]);
	const getAsinLinks = async () =>
		await page.$$eval(data.locators.productLink, el =>
			el.map(l => `https://www.amazon.com${l.getAttribute('href')}`)
		);
	let arr = await getAsinLinks();
	await page.waitFor(2000);
	await page.click(data.locators.paginationNextButton);
	await page.waitFor(2000);
	arr = [...arr, ...(await getAsinLinks())];
	let pagesNumber;
	if ((await page.$(data.locators.paginationLastDisabledPageButton)) !== null) {
		pagesNumber = await page.$eval(
			data.locators.paginationLastDisabledPageButton,
			el => el.innerText
		);
	} else {
		pagesNumber = await page.$$eval(
			data.locators.paginationNotDisabledButton,
			elements => elements[elements.length - 1].innerText
		);
	}
	for (let i = 3; i <= +pagesNumber; i++) {
		await page.goto(`${url}&page=${i}`);
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
for (let i = 0; i < args.length; i++) {
	try {
		launch().then(browser => {
			openCompanyPage(args[i], browser).then(page => {
				getCompanyName(page).then(company => {
					getCompanyProducts(page, browser, args[i], company.name).then(
						links => {
							const previousFile = companyFiles.find(i =>
								i.includes(`${company.name}_${company.id}`)
							);
							if (previousFile) {
								const oldAsins = fs.readFileSync(
									`companies/${previousFile}`,
									'utf8'
								);
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
									printMessage([
										`${company.name} has new products.`,
										`You can find new products links in the "result" folder`
									]);
								} else {
									printMessage([
										`Company ${company.name} doesn't have a new products`,
										`Please try again later `
									]);
								}
							} else {
								printMessage([
									`Didn't find previous data for ${company.name} company`,
									`Looks like it's your first searching for this company`,
									`File with current pruducts was created in "companies" folder`
								]);
							}
							fs.appendFileSync(
								`companies/${company.name}_${
									company.id
								}_${new Date().toDateString()}.txt`,
								JSON.stringify(links, null, 2)
							);
						}
					);
				});
			});
		});
	} catch (er) {
		throw new Error('Something went wrong, please try again', er);
	}
}
