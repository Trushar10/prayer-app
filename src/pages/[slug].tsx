import { GetStaticPaths, GetStaticProps } from 'next';
import { Entry, EntrySkeletonType, EntryFieldTypes } from 'contentful';
import { client } from '../lib/contentful';
import { documentToReactComponents } from '@contentful/rich-text-react-renderer';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Document } from '@contentful/rich-text-types';
import ThemeToggle from '../components/ThemeToggle';
import OfflineIndicator from '../components/OfflineIndicator';

// Helper function to clean URL slugs (replace spaces with hyphens)
const cleanUrlSlug = (text: string): string => {
	return text
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '-') // Replace spaces with hyphens
		.replace(/\-\-+/g, '-') // Replace multiple hyphens with single hyphen
		.replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

type PrayerSkeleton = EntrySkeletonType<{
	title: EntryFieldTypes.Text;
	slug: EntryFieldTypes.Text;
	body: EntryFieldTypes.RichText;
}>;

type PrayerEntry = Entry<PrayerSkeleton>;

export const getStaticPaths: GetStaticPaths = async () => {
	// Fetch all slugs from all supported languages
	const contentTypes = await client.getContentTypes();
	const paths: { params: { slug: string } }[] = [];

	for (const ct of contentTypes.items) {
		if (ct.sys.id.startsWith('prayer-')) {
			const langCode = ct.sys.id.split('-')[1];
			const res = await client.getEntries<PrayerSkeleton>({
				content_type: `prayer-${langCode}`,
				select: ['fields.slug'],
			});

			res.items.forEach((item) => {
				// Clean the original slug for URL use
				const cleanSlug = cleanUrlSlug(item.fields.slug);
				paths.push({ params: { slug: cleanSlug } });
			});
		}
	}

	return {
		paths,
		fallback: false,
	};
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
	const urlSlug = params?.slug as string;

	// Try to find the prayer in any language, defaulting to English
	const languages = ['en', 'hi', 'gu'];
	let matchingPrayer: PrayerEntry | null = null;

	for (const langCode of languages) {
		try {
			const res = await client.getEntries<PrayerSkeleton>({
				content_type: `prayer-${langCode}`,
			});

			// Find prayer where the cleaned slug matches our URL slug
			const prayer = res.items.find((item) => {
				return cleanUrlSlug(item.fields.slug) === urlSlug;
			});

			if (prayer) {
				matchingPrayer = prayer as PrayerEntry;
				break;
			}
		} catch {
			// Continue to next language if this one fails
			continue;
		}
	}

	if (!matchingPrayer) {
		return { notFound: true };
	}

	return {
		props: {
			prayer: matchingPrayer,
		},
		revalidate: 60,
	};
};

export default function PrayerPage({ prayer }: { prayer: PrayerEntry }) {
	const router = useRouter();

	if (!prayer) {
		return (
			<>
				<Head>
					<title>Prayer Not Found</title>
				</Head>
				<div className="container">
					<header className="header">
						<div className="header-content">
							<button
								className="back-btn"
								onClick={() => router.back()}
							>
								← Back
							</button>
							<div className="title">Prayer Not Found</div>
						</div>
					</header>
					<main className="single-post">
						<div className="post-content">
							<h1>Prayer Not Available</h1>
							<p>The requested prayer could not be found.</p>
						</div>
					</main>
				</div>
			</>
		);
	}

	return (
		<>
			<Head>
				<title>
					{typeof prayer.fields.title === 'string'
						? prayer.fields.title
						: 'Prayer'}
				</title>
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1"
				/>
				<meta name="theme-color" content="#317EFB" />
				<link rel="manifest" href="/manifest.json" />
				<link rel="icon" href="/favicon.webp" />
			</Head>

			<OfflineIndicator showOnlineMessage={true} />

			<div className="container show-single-post">
				<header className="header">
					<div className="header-content">
						<button
							className="back-btn"
							onClick={() => router.back()}
						>
							← Back
						</button>
						<div className="title">
							{typeof prayer.fields.title === 'string'
								? prayer.fields.title
								: 'Prayer'}
						</div>
					</div>
				</header>

				<main className="single-post">
					<article className="post-content">
						<h1>
							{typeof prayer.fields.title === 'string'
								? prayer.fields.title
								: 'Prayer'}
						</h1>
						<div className="content">
							{documentToReactComponents(
								prayer.fields.body as Document
							)}
						</div>
					</article>
				</main>
				<footer className="footer">
					<p>
						&copy; {new Date().getFullYear()} Prayer App. All rights
						reserved.
					</p>
				</footer>
				<ThemeToggle className="theme-toggle-fixed" />
			</div>
		</>
	);
}
