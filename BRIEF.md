My idea for this app - I want a simple way to track my finances. Some functionality I need:

- track my money across multiple bank accounts
- track my expenses and income (for the mvp we can do it manually via forms and csv imports)
- input what I expect to earn in future months so I can see how much money I expect to have in the future
- track recurring expenses
- some cards incur fees if you don't make x payments with them or spend x amount. I want to be able to input these cards and then based on the expenses the app should tell me if I'm in the clear of any fees
- I want to be able to share tables with others. For example I would like to share my bank account balances with my partner so she can see how much money we have and she should be able to also add her expenses and income - this is a notion of public and private tables
- we are about to get a mortgage, I would like to track my mortgage payments and see how much I have left to pay and how the interest rate affects my monthly payments and overall sum we need to repay. I also want to see if it's better to pay more for a given month and how much that saves me in the long run
- for tracking my income I would also like to see how that stacks against inflation, so I can see if I'm making a profit or loss
- the app should support multiple currencies
- by the way I am Polish and I'm based in Poland, but the app should be in english first but with i18n support ready
- we will work on the design in a later stage, for now we need to focus on the functionality. We can use tailwindcss, svelte-shadcn for the design

Now for future functionality (not in the mvp):

- I want to track my stocks and investments
- I would also like to calculate my future income for the year depending if I'm working on a b2b contract, how I pay taxes, if I have an employment contract(UoP in polish). I would also like to calculate the potential money I would make by using different savings accounts - say I want to compare what different banks have to offer, some offer higher interest on shorter terms other lower interest on longer terms.
- this could be extended to be a finanse OS for enterpreneuers and JDG

I want to focus on a webapp first. I propose we use Svelte and SvelteKit, Typescript with Effect, Tailwind CSS, and shadcn for the design, Hono for the API if needed. For auth I want Better-Auth. For the database/backend I propose we use Turso DB with Drizzle ORM. Reason why is I want something that is easy to use, can be used locally, has good performance.
