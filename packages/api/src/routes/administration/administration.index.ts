import { createRouter } from '../../lib/create-app';
import { administrator } from '../../middleware/administrator';
import { rateLimit } from '../../middleware/rate-limit';

const router = createRouter();

router.get('/service/registration', async (c) =>
	c.json({ registrationOpen: (await c.var.services.administration?.registrationOpen()) ?? true })
);

router.use('/admin/*', administrator);
router.use('/admin/*', rateLimit('admin', 30, 60));

router.get('/admin/state', async (c) => {
	const administration = c.var.services.administration;
	if (!administration) return c.json({ message: 'Administration unavailable' }, 503);
	const [registrationOpen, users, jobs] = await Promise.all([
		administration.registrationOpen(),
		administration.listUsers(),
		administration.listOperationalJobs()
	]);
	return c.json({ registrationOpen, users, jobs });
});

router.patch('/admin/registration', async (c) => {
	const body = await c.req.json<{ registrationOpen?: unknown }>();
	if (typeof body.registrationOpen !== 'boolean')
		return c.json({ message: 'registrationOpen must be boolean' }, 400);
	const administration = c.var.services.administration;
	if (!administration) return c.json({ message: 'Administration unavailable' }, 503);
	return c.json(await administration.setRegistrationOpen(body.registrationOpen));
});

router.post('/admin/users/:userId/:action', async (c) => {
	const administration = c.var.services.administration;
	if (!administration) return c.json({ message: 'Administration unavailable' }, 503);
	const userId = c.req.param('userId');
	const action = c.req.param('action');
	if (action === 'disable') return c.json(await administration.setUserDisabled(userId, true));
	if (action === 'restore-access')
		return c.json(await administration.setUserDisabled(userId, false));
	if (action === 'restore-account') return c.json(await administration.restoreAccount(userId));
	return c.json({ message: 'Unknown action' }, 404);
});

export const administrationRouter = router;
