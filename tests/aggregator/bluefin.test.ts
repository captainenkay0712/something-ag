// import { beforeAll, describe, setDefaultTimeout, test } from 'bun:test';
// import { TestFixture } from '../fixture';
// import { M_USDC, M_SUI } from '../test_data.test';

// setDefaultTimeout(30_000);
// describe('Swap router', () => {
//     let fixture: TestFixture;

//     beforeAll(async () => {
//         fixture = new TestFixture();
//         await fixture.setup();
        
//     })

//     describe('Pool (A -> B)', () => {
//         describe('Router one', () => {
            
//             test('success', async () => {
//                 await fixture.testDexRouter(
//                     "BLUEFIN",
//                     M_SUI,
//                     M_USDC,
//                     "10000000000",
//                     true
//                 )
//             });
//         })
//     })
// })