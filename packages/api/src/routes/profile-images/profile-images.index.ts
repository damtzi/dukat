import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { createRouter } from '../../lib/create-app';
import type { AppBindings } from '../../lib/types';
import { authenticated } from '../../middleware/authenticated';
import { ProfileImageError } from '../../profile-images';

const router = createRouter();

router.use(
	'/profile/image',
	bodyLimit({
		maxSize: 5 * 1024 * 1024 + 64 * 1024,
		onError: (c) => c.json({ message: 'Profile images must be 5 MB or smaller.' }, 413)
	})
);
router.use('/profile/image', authenticated);
router.use('/profile/image', async (c, next) => {
	const origin = c.req.header('origin');
	const allowedOrigins = [
		new URL(c.req.url).origin,
		...(c.var.services.trustedOrigins ?? []).map((trustedOrigin) => new URL(trustedOrigin).origin)
	];
	if (!origin || !allowedOrigins.includes(origin)) {
		return c.json({ message: 'Request origin is not allowed.' }, 403);
	}
	await next();
});

function errorResponse(c: Context<AppBindings>, error: unknown) {
	if (error instanceof ProfileImageError) {
		return c.json({ message: error.message }, error.status);
	}
	throw error;
}

router.post('/profile/image', async (c) => {
	try {
		const body = await c.req.raw.formData();
		const image = body.get('image');
		if (!(image instanceof File)) {
			return c.json({ message: 'Select an image to upload.' }, 400);
		}
		const session = await c.var.services.auth.api.getSession({ headers: c.req.raw.headers });
		if (!session) return c.json({ message: 'Unauthorized' }, 401);
		if (!c.var.services.profileImages) {
			return c.json({ message: 'Profile image storage is unavailable.' }, 503);
		}
		const publicUrl = await c.var.services.profileImages.replace({
			userId: c.var.userId,
			currentImage: session.user.image ?? null,
			source: new Uint8Array(await image.arrayBuffer()),
			crop: {
				x: Number(body.get('x')),
				y: Number(body.get('y')),
				zoom: Number(body.get('zoom'))
			}
		});
		return c.json({ image: publicUrl }, 200);
	} catch (error) {
		return errorResponse(c, error);
	}
});

router.delete('/profile/image', async (c) => {
	try {
		const session = await c.var.services.auth.api.getSession({ headers: c.req.raw.headers });
		if (!session) return c.json({ message: 'Unauthorized' }, 401);
		if (!c.var.services.profileImages) {
			return c.json({ message: 'Profile image storage is unavailable.' }, 503);
		}
		await c.var.services.profileImages.remove({
			userId: c.var.userId,
			currentImage: session.user.image ?? null
		});
		return c.body(null, 204);
	} catch (error) {
		return errorResponse(c, error);
	}
});

export const profileImagesRouter = router;
