describe('many commits and error creating signature', function () {
    it('should not get error creating signature on many repeated commits', async () => {
        const worker = new Worker(new URL('manycommits.worker.js', import.meta.url), {type: "module"});
        const result = await new Promise(resolve => worker.onmessage = (msg) => resolve(msg.data));
        expect(result).not.contain(`Error creating signature [-3] - config value 'user.name' was not found`);
    });
});