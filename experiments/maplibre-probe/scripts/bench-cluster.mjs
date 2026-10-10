/**
 * Node-side clustering microbench for the PERFORMANCE_AND_TILES report.
 * Run: node scripts/bench-cluster.mjs
 */
import { regionFromZoom } from '../src/probeCoordinates.js';
import { clearProbeDatasetCache, DATASET_SIZES } from '../src/probeDatasets.js';
import { prepareMapPipeline } from '../src/probePerf.js';

clearProbeDatasetCache();
const region = regionFromZoom(15.49, 73.83, 11);

console.log('size\tmode\tprepareMs\tfilterMs\tclusterMs\tvisible\titems\tstrategy');
for (const size of DATASET_SIZES) {
  for (const clusterMode of /** @type {const} */ (['grid', 'hierarchical'])) {
    // Warm cache once for prepare fairness on subsequent mode.
    prepareMapPipeline({ datasetSize: size, region, zoom: 11, clusterMode: 'hierarchical' });
    const runs = [];
    for (let i = 0; i < 5; i += 1) {
      const result = prepareMapPipeline({ datasetSize: size, region, zoom: 11, clusterMode });
      runs.push(result.metrics);
    }
    const avg = (key) => runs.reduce((sum, row) => sum + row[key], 0) / runs.length;
    console.log(
      [
        size,
        clusterMode,
        avg('prepareMs').toFixed(2),
        avg('filterMs').toFixed(2),
        avg('clusterMs').toFixed(2),
        runs[0].visibleCount,
        runs[0].itemCount,
        prepareMapPipeline({ datasetSize: size, region, zoom: 11, clusterMode }).strategy,
      ].join('\t'),
    );
  }
}
